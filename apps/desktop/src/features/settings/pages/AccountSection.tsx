/**
 * The read-only account row with the sign-out affordance.
 *
 * Signing out closes the gate immediately, wherever it is triggered: main
 * revokes the credential, clears the record, and broadcasts, and the shell's
 * outermost gate unmounts everything above the sign-in surface.
 *
 * The profile is read-only on purpose. The service's two profile write routes
 * (`PUT /system/user/profile` and `.../updatePwd`) are documented as panicking
 * the handler with no HTTP response, so this surface offers neither.
 */
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../../stores/app-store.ts";
import { api } from "../../../lib/api.ts";
import { Button } from "../../../components/ui.tsx";
import { SettingsCard, SettingsRow } from "../primitives.tsx";

export function AccountSection() {
  const { t, i18n } = useTranslation();
  const account = useAppStore((s) => s.account);
  const applyAccountState = useAppStore((s) => s.applyAccountState);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);

  const name = account.displayName ?? account.username ?? "";
  const roles = account.profile?.roles ?? [];

  const signOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutFailed(false);
    try {
      applyAccountState(await api.signOut());
    } catch {
      // Main clears the local record even when the service is unreachable, so
      // a throw here is only the broadcast failing to arrive; the gate is
      // already closed. Say so rather than leaving the button spinning.
      setSignOutFailed(true);
    } finally {
      setSigningOut(false);
    }
  }, [applyAccountState, signingOut]);

  const expiresAt =
    account.expiresAt === null
      ? null
      : new Intl.DateTimeFormat(i18n.language || undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(account.expiresAt * 1000));

  return (
    <SettingsCard
      title={t("account.settingsTitle")}
      description={t("account.note")}
    >
      <SettingsRow
        title={name ? t("account.signedInAs", { name }) : t("account.settingsTitle")}
        detail={
          <>
            {roles.length > 0 ? (
              <span>{t("account.roles", { roles: roles.join(", ") })}</span>
            ) : null}
            {expiresAt ? (
              <span>{t("account.sessionExpires", { time: expiresAt })}</span>
            ) : null}
          </>
        }
      >
        <Button
          variant="secondary"
          size="sm"
          disabled={signingOut}
          onClick={() => void signOut()}
        >
          {signingOut ? t("account.signingOut") : t("account.signOut")}
        </Button>
      </SettingsRow>
      {signOutFailed ? (
        <span className="settings-command-shell-state error" role="status">
          {t("account.error.failed")}
        </span>
      ) : null}
    </SettingsCard>
  );
}
