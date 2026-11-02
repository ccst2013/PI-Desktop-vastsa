/**
 * The account service HTTP client, driven against a real local server.
 *
 * These are the behaviours the integration document calls out as easy to get
 * wrong, and each one is a production bug if it regresses: the flat response
 * envelope, the body-level status code, the single-use challenge, the
 * credential rotation, and the rule that no credential may travel anywhere it
 * was not meant to.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import {
  AccountServiceError,
  ADMIN_TOKEN_COOKIE_NAME,
  REMEMBER_COOKIE_NAME,
  classifyBodyFailure,
  createGunyuClient,
  readSetCookies,
} from "../electron/main/account/gunyu-client.ts";

/** A bare 1x1 PNG, base64 — the service sends the image without a data prefix. */
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const REMEMBER_VALUE = "series-abc:token-xyz";

/**
 * Start a fixture that answers every route from one handler.
 *
 * Returns the base URL plus the requests it saw, so a test can assert on the
 * headers that went out and not only on the response that came back.
 */
async function startFixture(handler) {
  const requests = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      requests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body,
      });
      handler({ req, res, body, requests });
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/dev-api`;
  return {
    base,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** Send a flat envelope the way the service does: fields beside `code`/`msg`. */
function sendFlat(res, payload, cookies = []) {
  // One call with an array: `setHeader` called twice would overwrite, and the
  // service really does send the rotated credential and the new session token
  // as two separate Set-Cookie headers.
  if (cookies.length > 0) res.setHeader("Set-Cookie", cookies);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

const rememberCookieHeader = `${REMEMBER_COOKIE_NAME}=${REMEMBER_VALUE}; Path=/dev-api; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`;
const adminTokenHeader = `${ADMIN_TOKEN_COOKIE_NAME}=rotated-session; Path=/; Max-Age=3600; Secure; SameSite=Lax`;

test("captchaImage is read from the flat envelope, not a data wrapper", async () => {
  const fixture = await startFixture(({ res }) => {
    sendFlat(res, {
      code: 200,
      msg: "成功",
      uuid: "MKeceQrK9daCVvVcjcxv",
      img: TINY_PNG_BASE64,
      captchaEnabled: true,
    });
  });
  try {
    const client = createGunyuClient({ baseUrl: fixture.base });
    const captcha = await client.captcha();
    assert.equal(captcha.uuid, "MKeceQrK9daCVvVcjcxv");
    // The client hands back the bare base64; the service layer adds the prefix.
    assert.equal(captcha.img, TINY_PNG_BASE64);
    assert.equal(captcha.captchaEnabled, true);
    assert.equal(fixture.requests[0].url, "/dev-api/captchaImage");
    // A public route: no credential may go out with it.
    assert.equal(fixture.requests[0].headers.authorization, undefined);
    assert.equal(fixture.requests[0].headers.cookie, undefined);
  } finally {
    await fixture.close();
  }
});

test("a deployment that turned the challenge off reports captchaEnabled false", async () => {
  const fixture = await startFixture(({ res }) => {
    sendFlat(res, { code: 200, msg: "成功", uuid: "abc", captchaEnabled: false });
  });
  try {
    const client = createGunyuClient({ baseUrl: fixture.base });
    const captcha = await client.captcha();
    assert.equal(captcha.captchaEnabled, false);
    // No image is sent when the challenge is off; that is not a malformed reply.
    assert.equal(captcha.img, "");
  } finally {
    await fixture.close();
  }
});

test("rememberLogin reads token, expiresIn and the issued credential", async () => {
  const fixture = await startFixture(({ res, body }) => {
    const parsed = JSON.parse(body);
    assert.equal(parsed.username, "admin");
    assert.equal(parsed.rememberMe, true);
    sendFlat(
      res,
      {
        code: 200,
        msg: "成功",
        token: "session-token-1",
        expiresIn: 3600,
        rememberMe: true,
      },
      [rememberCookieHeader],
    );
  });
  try {
    const client = createGunyuClient({ baseUrl: fixture.base });
    const login = await client.login({
      username: "admin",
      password: "admin123",
      code: "4927",
      uuid: "ticket",
      rememberMe: true,
    });
    assert.equal(login.token, "session-token-1");
    assert.equal(login.expiresIn, 3600);
    assert.equal(login.rememberMe, true);
    assert.equal(login.rememberCookie, REMEMBER_VALUE);
  } finally {
    await fixture.close();
  }
});

test("rememberMe reports what the service issued, not what was asked for", async () => {
  // Issuance degrades silently to false on a database failure while the
  // sign-in itself still succeeds; trusting the checkbox would promise a
  // passwordless return that will not happen.
  const fixture = await startFixture(({ res }) => {
    sendFlat(res, {
      code: 200,
      msg: "成功",
      token: "session-token-1",
      expiresIn: 3600,
      rememberMe: false,
    });
  });
  try {
    const client = createGunyuClient({ baseUrl: fixture.base });
    const login = await client.login({
      username: "admin",
      password: "admin123",
      code: "4927",
      uuid: "ticket",
      rememberMe: true,
    });
    assert.equal(login.rememberMe, false);
    assert.equal(login.rememberCookie, null);
  } finally {
    await fixture.close();
  }
});

test("a wrong challenge answer is AUTH_CAPTCHA, not a generic refusal", async () => {
  const fixture = await startFixture(({ res }) => {
    sendFlat(res, { code: 500, msg: "验证码错误" });
  });
  try {
    const client = createGunyuClient({ baseUrl: fixture.base });
    await assert.rejects(
      () =>
        client.login({
          username: "admin",
          password: "admin123",
          code: "0000",
          uuid: "ticket",
          rememberMe: false,
        }),
      (error) => {
        assert.ok(error instanceof AccountServiceError);
        assert.equal(error.code, "AUTH_CAPTCHA");
        // The bridge reads `errorCode`; without it the code degrades to INTERNAL.
        assert.equal(error.errorCode, "AUTH_CAPTCHA");
        return true;
      },
    );
  } finally {
    await fixture.close();
  }
});

test("a wrong password and a disabled account are AUTH_REJECTED", async () => {
  for (const msg of ["密码错误", "用户不存在或被禁用"]) {
    const fixture = await startFixture(({ res }) => sendFlat(res, { code: 500, msg }));
    try {
      const client = createGunyuClient({ baseUrl: fixture.base });
      await assert.rejects(
        () =>
          client.login({
            username: "admin",
            password: "wrong",
            code: "4927",
            uuid: "ticket",
            rememberMe: false,
          }),
        (error) => {
          assert.equal(error.code, "AUTH_REJECTED");
          return true;
        },
      );
    } finally {
      await fixture.close();
    }
  }
});

test("a dead dependency is a service error, never the user's fault", async () => {
  const fixture = await startFixture(({ res }) => {
    sendFlat(res, { code: 500, msg: "dial tcp 127.0.0.1:6379: connect: connection refused" });
  });
  try {
    const client = createGunyuClient({ baseUrl: fixture.base });
    await assert.rejects(
      () =>
        client.login({
          username: "admin",
          password: "admin123",
          code: "4927",
          uuid: "ticket",
          rememberMe: false,
        }),
      (error) => {
        assert.equal(error.code, "AUTH_SERVICE_ERROR");
        return true;
      },
    );
  } finally {
    await fixture.close();
  }
});

test("a lapsed session is SESSION_EXPIRED", async () => {
  const fixture = await startFixture(({ res }) => sendFlat(res, { code: 401, msg: "未登录" }));
  try {
    const client = createGunyuClient({ baseUrl: fixture.base });
    await assert.rejects(
      () => client.info({ token: "stale" }),
      (error) => {
        assert.equal(error.code, "SESSION_EXPIRED");
        return true;
      },
    );
  } finally {
    await fixture.close();
  }
});

test("a binding failure is AUTH_CLIENT", async () => {
  const fixture = await startFixture(({ res }) => {
    sendFlat(res, { code: 400, msg: "用户名不能为空" });
  });
  try {
    const client = createGunyuClient({ baseUrl: fixture.base });
    await assert.rejects(
      () =>
        client.login({
          username: "",
          password: "admin123",
          code: "4927",
          uuid: "ticket",
          rememberMe: false,
        }),
      (error) => {
        assert.equal(error.code, "AUTH_CLIENT");
        return true;
      },
    );
  } finally {
    await fixture.close();
  }
});

test("getInfo sends Authorization and no Cookie on an authenticated read", async () => {
  const fixture = await startFixture(({ res }) => {
    sendFlat(res, {
      code: 200,
      msg: "成功",
      user: {
        userId: 1,
        userName: "admin",
        nickName: "若依",
        email: "ry@163.com",
        admin: true,
        dept: { deptName: "研发部门" },
      },
      roles: ["admin"],
      permissions: ["*:*:*"],
    });
  });
  try {
    const client = createGunyuClient({ baseUrl: fixture.base });
    const info = await client.info({ token: "session-token-1" });
    assert.equal(fixture.requests[0].headers.authorization, "Bearer session-token-1");
    assert.equal(fixture.requests[0].headers.cookie, undefined);
    assert.equal(info.user.userName, "admin");
    assert.equal(info.user.nickName, "若依");
    assert.equal(info.user.deptName, "研发部门");
    assert.equal(info.user.admin, true);
    assert.deepEqual(info.roles, ["admin"]);
    assert.deepEqual(info.permissions, ["*:*:*"]);
    // An authenticated read rotates nothing, so there is no new session to report.
    assert.equal(info.rotatedToken, null);
    assert.equal(info.rotatedExpiresIn, null);
  } finally {
    await fixture.close();
  }
});

test("getInfo sends the credential as a Cookie and no Authorization on an automatic sign-in", async () => {
  // This is the exact request shape the middleware requires: no Authorization,
  // a GUANYU_REMEMBER cookie. Sending both would skip the automatic sign-in.
  const fixture = await startFixture(({ res }) => {
    sendFlat(
      res,
      {
        code: 200,
        msg: "成功",
        user: { userId: 1, userName: "admin", nickName: "若依", admin: true },
        roles: ["admin"],
        permissions: ["*:*:*"],
      },
      [
        `${REMEMBER_COOKIE_NAME}=series-abc:token-ROTATED; Path=/dev-api; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`,
        adminTokenHeader,
      ],
    );
  });
  try {
    const client = createGunyuClient({ baseUrl: fixture.base });
    const info = await client.info({ token: null, rememberCookie: REMEMBER_VALUE });
    assert.equal(fixture.requests[0].headers.authorization, undefined);
    assert.equal(
      fixture.requests[0].headers.cookie,
      `${REMEMBER_COOKIE_NAME}=${REMEMBER_VALUE}`,
    );
    assert.equal(info.rotatedToken, "rotated-session");
    // The rebuilt session's lifetime is only reported as the cookie's Max-Age.
    assert.equal(info.rotatedExpiresIn, 3600);
    assert.equal(info.rememberCookie, "series-abc:token-ROTATED");
  } finally {
    await fixture.close();
  }
});

test("rememberDisable carries an explicit Authorization", async () => {
  // Without it the automatic sign-in middleware would re-authenticate the call
  // and it would succeed while revoking nothing.
  const fixture = await startFixture(({ res, body }) => {
    assert.equal(JSON.parse(body).allDevices, false);
    sendFlat(res, { code: 200, msg: "成功", allDevices: false });
  });
  try {
    const client = createGunyuClient({ baseUrl: fixture.base });
    await client.disableRemember({ token: "session-token-1", allDevices: false });
    assert.equal(fixture.requests[0].headers.authorization, "Bearer session-token-1");
    assert.equal(fixture.requests[0].url, "/dev-api/rememberDisable");
  } finally {
    await fixture.close();
  }
});

test("an unreachable service is distinguished from a rejection", async () => {
  // A port nothing listens on: the failure must read as "the service is down",
  // never as "your password is wrong".
  const client = createGunyuClient({ baseUrl: "http://127.0.0.1:1/dev-api", timeoutMs: 2000 });
  await assert.rejects(
    () => client.captcha(),
    (error) => {
      assert.equal(error.code, "AUTH_UNREACHABLE");
      return true;
    },
  );
});

test("a service that never answers is AUTH_TIMEOUT", async () => {
  const fixture = await startFixture(() => {
    // Deliberately never responds.
  });
  try {
    const client = createGunyuClient({ baseUrl: fixture.base, timeoutMs: 120 });
    await assert.rejects(
      () => client.captcha(),
      (error) => {
        assert.equal(error.code, "AUTH_TIMEOUT");
        return true;
      },
    );
  } finally {
    await fixture.close();
  }
});

test("a non-JSON answer is AUTH_MALFORMED", async () => {
  const fixture = await startFixture(({ res }) => {
    res.setHeader("Content-Type", "text/html");
    res.end("<html>login page from a captive portal</html>");
  });
  try {
    const client = createGunyuClient({ baseUrl: fixture.base });
    await assert.rejects(
      () => client.captcha(),
      (error) => {
        assert.equal(error.code, "AUTH_MALFORMED");
        return true;
      },
    );
  } finally {
    await fixture.close();
  }
});

test("an envelope without a code is AUTH_MALFORMED", async () => {
  const fixture = await startFixture(({ res }) => {
    sendFlat(res, { token: "no-code-here" });
  });
  try {
    const client = createGunyuClient({ baseUrl: fixture.base });
    await assert.rejects(
      () => client.captcha(),
      (error) => {
        assert.equal(error.code, "AUTH_MALFORMED");
        return true;
      },
    );
  } finally {
    await fixture.close();
  }
});

test("a redirect is refused rather than followed with the credential", async () => {
  const fixture = await startFixture(({ res }) => {
    res.statusCode = 302;
    res.setHeader("Location", "http://127.0.0.1:1/elsewhere");
    res.end();
  });
  try {
    const client = createGunyuClient({ baseUrl: fixture.base });
    await assert.rejects(
      () => client.info({ token: "session-token-1" }),
      (error) => {
        assert.equal(error.code, "AUTH_UNREACHABLE");
        return true;
      },
    );
    // Exactly one request: the redirect target was never contacted.
    assert.equal(fixture.requests.length, 1);
  } finally {
    await fixture.close();
  }
});

test("no failure carries the submitted password or credential", async () => {
  const password = "super-secret-password";
  const fixture = await startFixture(({ res }) => {
    sendFlat(res, { code: 500, msg: `rejected ${password} and ${REMEMBER_VALUE}` });
  });
  const logged = [];
  try {
    const client = createGunyuClient({
      baseUrl: fixture.base,
      log: (level, message, data) => logged.push({ level, message, data }),
    });
    const error = await client
      .login({
        username: "admin",
        password,
        code: "4927",
        uuid: "ticket",
        rememberMe: true,
      })
      .then(
        () => null,
        (thrown) => thrown,
      );
    assert.ok(error);
    // The service echoed the password back in `msg`; the client must not repeat it.
    assert.ok(!error.message.includes(password), "error message leaked the password");
    assert.ok(!error.message.includes(REMEMBER_VALUE), "error message leaked the credential");
    const serialized = JSON.stringify(logged);
    assert.ok(!serialized.includes(password), "log leaked the password");
    assert.ok(!serialized.includes(REMEMBER_VALUE), "log leaked the credential");
    assert.ok(!serialized.includes("session-token"), "log leaked a token");
  } finally {
    await fixture.close();
  }
});

test("a Max-Age=-1 Set-Cookie is a clear, not a rotation", async () => {
  const fixture = await startFixture(({ res }) => {
    sendFlat(
      res,
      {
        code: 200,
        msg: "成功",
        user: { userId: 1, userName: "admin", nickName: "若依", admin: false },
        roles: [],
        permissions: [],
      },
      [`${REMEMBER_COOKIE_NAME}=; Path=/dev-api; Max-Age=-1; HttpOnly; Secure; SameSite=Lax`],
    );
  });
  try {
    const client = createGunyuClient({ baseUrl: fixture.base });
    const info = await client.info({ token: null, rememberCookie: REMEMBER_VALUE });
    // The service revoked the credential; the caller must drop its copy rather
    // than keep replaying a value that is now dead.
    assert.equal(info.rememberCookie, null);
  } finally {
    await fixture.close();
  }
});

test("readSetCookies keeps multiple headers separate", () => {
  // `headers.get("set-cookie")` would join these with ", " and corrupt the
  // second value; `getSetCookie()` is the only correct read.
  const response = new Response("{}", {
    headers: [
      ["Set-Cookie", rememberCookieHeader],
      ["Set-Cookie", adminTokenHeader],
    ],
  });
  const cookies = readSetCookies(response);
  assert.equal(cookies.length, 2);
  assert.deepEqual(
    cookies.map((cookie) => cookie.name),
    [REMEMBER_COOKIE_NAME, ADMIN_TOKEN_COOKIE_NAME],
  );
  assert.equal(cookies[0].value, REMEMBER_VALUE);
  assert.equal(cookies[0].expired, false);
  assert.equal(cookies[0].maxAgeSeconds, 2592000);
  assert.equal(cookies[1].value, "rotated-session");
  assert.equal(cookies[1].maxAgeSeconds, 3600);
});

test("classifyBodyFailure splits input faults from service faults", () => {
  assert.equal(classifyBodyFailure(401, "未登录"), "SESSION_EXPIRED");
  assert.equal(classifyBodyFailure(400, "用户名不能为空"), "AUTH_CLIENT");
  assert.equal(classifyBodyFailure(500, "验证码错误"), "AUTH_CAPTCHA");
  assert.equal(classifyBodyFailure(500, "密码错误"), "AUTH_REJECTED");
  assert.equal(classifyBodyFailure(500, "用户不存在或被禁用"), "AUTH_REJECTED");
  assert.equal(classifyBodyFailure(500, "redis is down"), "AUTH_SERVICE_ERROR");
});
