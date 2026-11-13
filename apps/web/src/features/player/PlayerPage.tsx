import { formatStructuredMessage, t, type StructuredMessage } from '@quest-forge/engine';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiClientError, type GameSessionResponse } from '../../api/client.js';
import { TopBar } from '../../components/TopBar.js';
import { useAppPreferences } from '../../state/preferences.js';

type PlayerPageProps = {
  questId: string;
  onNavigate: (path: string) => void;
};

function storageKey(questId: string): string {
  return `qf_web_session_${questId}`;
}

export function PlayerPage({ questId, onNavigate }: PlayerPageProps) {
  const { locale, theme } = useAppPreferences();
  const [session, setSession] = useState<GameSessionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [newItems, setNewItems] = useState<string[]>([]);
  const [notices, setNotices] = useState<StructuredMessage[]>([]);
  const [audioMuted, setAudioMuted] = useState(false);

  // Typewriter reveal state
  const [revealedCount, setRevealedCount] = useState(0);
  const [typewriterActive, setTypewriterActive] = useState(false);
  const lastAnimatedSceneKeyRef = useRef<string>('');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const startFresh = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    setNewItems([]);
    setNotices([]);
    lastAnimatedSceneKeyRef.current = '';
    try {
      const started = await api.startGame(questId, locale);
      try {
        window.localStorage.setItem(storageKey(questId), started.sessionId);
      } catch {
        // Ignore storage restrictions
      }
      setSession(started);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMsg(formatStructuredMessage(locale, { code: err.code, params: err.params }));
      } else {
        setErrorMsg(t(locale, 'player.errorLoad'));
      }
    } finally {
      setLoading(false);
    }
  }, [questId, locale]);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      setLoading(true);
      setErrorMsg(null);
      let savedId: string | null = null;
      try {
        savedId = window.localStorage.getItem(storageKey(questId));
      } catch {
        savedId = null;
      }

      if (savedId) {
        try {
          const existing = await api.getGame(savedId, locale);
          if (!cancelled) {
            setSession(existing);
            setLoading(false);
          }
          return;
        } catch {
          // Stale session; start a new one
        }
      }

      if (!cancelled) {
        await startFresh();
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [questId, locale, startFresh]);

  // Typewriter effect respecting prefers-reduced-motion
  useEffect(() => {
    if (!session) {
      return;
    }
    const view = session.view;
    const animKey = `${session.sessionId}:${view.scene.id}:${view.steps}`;
    if (lastAnimatedSceneKeyRef.current === animKey) {
      return;
    }
    lastAnimatedSceneKeyRef.current = animKey;

    const fullLength = view.scene.bodyMarkdown.length;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced || fullLength === 0) {
      setRevealedCount(fullLength);
      setTypewriterActive(false);
      return;
    }

    setRevealedCount(0);
    setTypewriterActive(true);
    const stepSize = Math.max(3, Math.ceil(fullLength / 40));
    const timer = window.setInterval(() => {
      setRevealedCount((prev) => {
        const next = Math.min(fullLength, prev + stepSize);
        if (next >= fullLength) {
          window.clearInterval(timer);
          setTypewriterActive(false);
        }
        return next;
      });
    }, 16);

    return () => {
      window.clearInterval(timer);
    };
  }, [session]);

  // Sync scene background audio
  useEffect(() => {
    const audioEl = audioRef.current;
    const url = session?.view.scene.audioUrl ?? null;
    if (!audioEl) {
      return;
    }
    audioEl.muted = audioMuted;
    if (!url) {
      audioEl.pause();
      audioEl.removeAttribute('src');
      return;
    }
    if (audioEl.getAttribute('data-src') !== url) {
      audioEl.setAttribute('data-src', url);
      audioEl.src = url;
    }
    if (!audioMuted) {
      void audioEl.play().catch(() => {
        // Autoplay may wait for user gesture
      });
    } else {
      audioEl.pause();
    }
  }, [session?.view.scene.audioUrl, audioMuted]);

  const skipTypewriter = useCallback(() => {
    if (!session) {
      return;
    }
    setRevealedCount(session.view.scene.bodyMarkdown.length);
    setTypewriterActive(false);
  }, [session]);

  const handleChoice = useCallback(
    async (choiceId: string) => {
      if (!session || busy) {
        return;
      }
      setBusy(true);
      setErrorMsg(null);
      try {
        const res = await api.applyChoice(session.sessionId, choiceId, locale);
        setNewItems(res.newItems);
        setNotices(res.notices);
        setSession(res);
      } catch (err) {
        if (err instanceof ApiClientError) {
          setErrorMsg(formatStructuredMessage(locale, { code: err.code, params: err.params }));
        }
      } finally {
        setBusy(false);
      }
    },
    [session, busy, locale],
  );

  const handleUndo = useCallback(async () => {
    if (!session || busy || !session.view.canUndo) {
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    setNewItems([]);
    setNotices([]);
    try {
      const res = await api.undoGame(session.sessionId, locale);
      setSession(res);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMsg(formatStructuredMessage(locale, { code: err.code, params: err.params }));
      }
    } finally {
      setBusy(false);
    }
  }, [session, busy, locale]);

  // Keyboard shortcuts: 1-9 choices, Z undo, Space/Enter skip typewriter
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.closest('dialog'))
      ) {
        return;
      }

      if ((event.code === 'Space' || event.code === 'Enter') && typewriterActive) {
        event.preventDefault();
        skipTypewriter();
        return;
      }

      if (event.code === 'KeyZ' && !event.ctrlKey && !event.metaKey) {
        if (session?.view.canUndo) {
          event.preventDefault();
          void handleUndo();
        }
        return;
      }

      const digitMatch = /^Digit([1-9])$/.exec(event.code);
      if (digitMatch && session && session.view.status === 'playing') {
        const idx = Number(digitMatch[1]) - 1;
        const choice = session.view.choices[idx];
        if (choice?.available) {
          event.preventDefault();
          void handleChoice(choice.id);
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [session, typewriterActive, skipTypewriter, handleUndo, handleChoice]);

  const view = session?.view;

  return (
    <>
      <audio ref={audioRef} loop preload="none" />
      <TopBar
        onNavigate={onNavigate}
        extraActions={
          session && (
            <>
              {view?.scene.audioUrl && (
                <button
                  type="button"
                  className="qf-btn"
                  onClick={() => {
                    setAudioMuted((prev) => !prev);
                  }}
                >
                  {t(locale, audioMuted ? 'player.audioUnmute' : 'player.audioMute')}
                </button>
              )}
              <button
                type="button"
                className="qf-btn"
                disabled={!view?.canUndo || busy}
                onClick={() => void handleUndo()}
              >
                {t(locale, 'player.undo')} (Z)
              </button>
              <button
                type="button"
                className="qf-btn"
                disabled={busy}
                onClick={() => void startFresh()}
              >
                {t(locale, 'player.restart')}
              </button>
              <a
                className="qf-btn qf-link-btn"
                href={api.exportHtmlUrl(questId, locale, theme)}
                download
              >
                {t(locale, 'catalog.exportHtml')}
              </a>
            </>
          )
        }
      />

      <main id="main-content" className="qf-container" tabIndex={-1}>
        {errorMsg && (
          <div role="alert" className="qf-error-banner">
            {errorMsg}
          </div>
        )}

        {loading || !view ? (
          <div className="qf-card">
            <p style={{ margin: 0 }}>{t(locale, 'player.loading')}</p>
          </div>
        ) : (
          <div className="qf-player-grid">
            <section className="qf-card">
              <div aria-live="polite" className="qf-toast-stack">
                {newItems.map((item) => (
                  <span key={item} className="qf-badge qf-badge-new">
                    + {t(locale, 'player.newItem')}: {item}
                  </span>
                ))}
                {notices.map((msg, idx) => (
                  <span key={`${msg.code}-${idx}`} className="qf-badge qf-badge-info">
                    {formatStructuredMessage(locale, msg)}
                  </span>
                ))}
              </div>

              {view.scene.imageUrl && (
                <img
                  className="qf-scene-illustration"
                  src={view.scene.imageUrl}
                  alt={view.scene.title}
                />
              )}

              <h1 className="qf-scene-title">{view.scene.title}</h1>

              {typewriterActive ? (
                <div>
                  <div
                    className="qf-narrative"
                    onClick={skipTypewriter}
                    style={{ whiteSpace: 'pre-wrap', cursor: 'pointer' }}
                  >
                    {view.scene.bodyMarkdown.slice(0, revealedCount)}
                  </div>
                  <button
                    type="button"
                    className="qf-btn"
                    style={{ marginTop: '0.6rem' }}
                    onClick={skipTypewriter}
                  >
                    {t(locale, 'player.skipTypewriter')}
                  </button>
                </div>
              ) : (
                <div
                  className="qf-narrative"
                  dangerouslySetInnerHTML={{ __html: view.scene.bodyHtml }}
                />
              )}

              {view.status === 'playing' ? (
                <div className="qf-choices">
                  {view.choices.map((choice, idx) => (
                    <button
                      key={choice.id}
                      type="button"
                      className={`qf-btn qf-choice-btn ${choice.available ? '' : 'qf-choice-locked'}`}
                      disabled={!choice.available || busy}
                      onClick={() => void handleChoice(choice.id)}
                    >
                      <span className="qf-choice-index">{idx < 9 ? idx + 1 : '•'}</span>
                      <span>
                        {choice.text}
                        {!choice.available && choice.lockReasons.length > 0 && (
                          <span className="qf-lock-reason">
                            {choice.lockReasons
                              .map((r) => formatStructuredMessage(locale, r))
                              .join(' · ')}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className={`qf-ending-banner ${view.status}`}>
                  <strong>{t(locale, `player.ending.${view.status}`)}</strong>
                  <div className="qf-controls-row" style={{ marginTop: '0.75rem' }}>
                    <button
                      type="button"
                      className="qf-btn qf-btn-primary"
                      disabled={busy}
                      onClick={() => void startFresh()}
                    >
                      {t(locale, 'player.restart')}
                    </button>
                    {view.canUndo && (
                      <button
                        type="button"
                        className="qf-btn"
                        disabled={busy}
                        onClick={() => void handleUndo()}
                      >
                        {t(locale, 'player.undo')} (Z)
                      </button>
                    )}
                    <button
                      type="button"
                      className="qf-btn"
                      onClick={() => {
                        onNavigate('/');
                      }}
                    >
                      {t(locale, 'player.backToCatalog')}
                    </button>
                  </div>
                </div>
              )}

              <p style={{ margin: '1.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                {t(locale, 'player.hotkeysHint')}
              </p>
            </section>

            <aside className="qf-card">
              <div
                className="qf-sidebar-section"
                style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}
              >
                <div className="qf-controls-row" style={{ justifyContent: 'space-between' }}>
                  <span className="qf-badge">
                    {t(locale, 'player.steps')}: {view.steps}
                  </span>
                  <span className="qf-badge">
                    {t(locale, 'player.visited')}: {view.visitedSceneIds.length}/{view.totalScenes}
                  </span>
                </div>
              </div>

              <div className="qf-sidebar-section">
                <h2 className="qf-sidebar-title">{t(locale, 'player.inventory')}</h2>
                {view.inventory.length > 0 ? (
                  <div className="qf-pill-list">
                    {view.inventory.map((item) => (
                      <span
                        key={item}
                        className={`qf-badge ${newItems.includes(item) ? 'qf-badge-new' : ''}`}
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    {t(locale, 'player.inventoryEmpty')}
                  </p>
                )}
              </div>

              <div className="qf-sidebar-section">
                <h2 className="qf-sidebar-title">{t(locale, 'player.variables')}</h2>
                {Object.keys(view.variables).length > 0 ? (
                  <ul className="qf-var-list">
                    {Object.entries(view.variables).map(([key, value]) => {
                      const displayVal =
                        typeof value === 'boolean'
                          ? locale === 'ru'
                            ? value
                              ? 'да'
                              : 'нет'
                            : value
                              ? 'yes'
                              : 'no'
                          : String(value);
                      return (
                        <li key={key} className="qf-var-row">
                          <span className="qf-mono">{key}</span>
                          <strong className="qf-mono">{displayVal}</strong>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    {t(locale, 'player.variablesEmpty')}
                  </p>
                )}
              </div>

              <div className="qf-sidebar-section">
                <h2 className="qf-sidebar-title">{t(locale, 'player.log')}</h2>
                {view.log.length > 0 ? (
                  <ul className="qf-log-list">
                    {[...view.log].reverse().map((entry) => (
                      <li key={entry.step} className="qf-log-entry">
                        <small className="qf-mono">#{entry.step}</small>{' '}
                        <strong>{entry.sceneTitle}</strong> → {entry.choiceText}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    {t(locale, 'player.logEmpty')}
                  </p>
                )}
              </div>
            </aside>
          </div>
        )}
      </main>
    </>
  );
}
