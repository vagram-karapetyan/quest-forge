import { formatStructuredMessage, t } from '@quest-forge/engine';
import { useEffect, useId, useRef, useState } from 'react';
import { ApiClientError } from '../api/client.js';
import { useAppPreferences } from '../state/preferences.js';

export function AuthDialog() {
  const { locale, loginDialogOpen, closeLoginDialog, login } = useAppPreferences();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const pressedOutsideRef = useRef(false);
  const titleId = useId();
  const userId = useId();
  const passId = useId();

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (loginDialogOpen && !dialog.open) {
      setErrorMsg(null);
      setPassword('');
      dialog.showModal();
    } else if (!loginDialogOpen && dialog.open) {
      dialog.close();
    }
  }, [loginDialogOpen]);

  function isOutside(e: React.PointerEvent<HTMLDialogElement>): boolean {
    const rect = e.currentTarget.getBoundingClientRect();
    return (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    );
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await login(username.trim(), password);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMsg(formatStructuredMessage(locale, { code: err.code, params: err.params }));
      } else {
        setErrorMsg(t(locale, 'msg.ERR_INVALID_CREDENTIALS'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="qf-dialog"
      aria-labelledby={titleId}
      onClose={() => {
        if (dialogRef.current) {
          dialogRef.current.returnValue = '';
        }
        closeLoginDialog();
      }}
      onPointerDown={(e) => {
        pressedOutsideRef.current = isOutside(e);
      }}
      onPointerUp={(e) => {
        if (pressedOutsideRef.current && isOutside(e)) {
          closeLoginDialog();
        }
        pressedOutsideRef.current = false;
      }}
    >
      <h2 id={titleId} className="qf-dialog-title">
        {t(locale, 'auth.modalTitle')}
      </h2>
      <p className="qf-dialog-body">{t(locale, 'auth.protectedHint')}</p>

      {errorMsg && (
        <div role="alert" className="qf-error-banner">
          {errorMsg}
        </div>
      )}

      <form className="qf-form-stack" onSubmit={(e) => void handleSubmit(e)}>
        <div>
          <label htmlFor={userId} className="qf-label">
            {t(locale, 'auth.username')}
          </label>
          <input
            id={userId}
            className="qf-input"
            type="text"
            autoComplete="username"
            required
            autoFocus
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
            }}
          />
        </div>

        <div>
          <label htmlFor={passId} className="qf-label">
            {t(locale, 'auth.password')}
          </label>
          <input
            id={passId}
            className="qf-input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
          />
        </div>

        <div className="qf-dialog-actions">
          <button type="button" className="qf-btn" onClick={closeLoginDialog}>
            {t(locale, 'auth.cancel')}
          </button>
          <button type="submit" className="qf-btn qf-btn-primary" disabled={submitting}>
            {t(locale, 'auth.submit')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
