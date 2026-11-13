import { formatStructuredMessage, t } from '@quest-forge/engine';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { api, ApiClientError, type QuestSummary } from '../../api/client.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.js';
import { TopBar } from '../../components/TopBar.js';
import { useAppPreferences } from '../../state/preferences.js';

type CatalogPageProps = {
  onNavigate: (path: string) => void;
};

export function CatalogPage({ onNavigate }: CatalogPageProps) {
  const { locale, theme, auth, openLoginDialog } = useAppPreferences();
  const [quests, setQuests] = useState<QuestSummary[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [pendingDelete, setPendingDelete] = useState<QuestSummary | null>(null);

  const createDialogRef = useRef<HTMLDialogElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const searchId = useId();
  const createDialogTitleId = useId();
  const newTitleId = useId();
  const newDescId = useId();

  const canAuthor = !auth.authEnabled || auth.authenticated;

  const loadQuests = useCallback(
    async (query: string) => {
      try {
        setErrorMsg(null);
        const res = await api.listQuests(query);
        setQuests(res.quests);
      } catch (err) {
        if (err instanceof ApiClientError) {
          setErrorMsg(formatStructuredMessage(locale, { code: err.code, params: err.params }));
        } else {
          setErrorMsg(t(locale, 'player.errorLoad'));
        }
      } finally {
        setLoading(false);
      }
    },
    [locale],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadQuests(search);
    }, 150);
    return () => {
      window.clearTimeout(timer);
    };
  }, [search, loadQuests]);

  useEffect(() => {
    const dialog = createDialogRef.current;
    if (!dialog) {
      return;
    }
    if (createOpen && !dialog.open) {
      setNewTitle('');
      setNewDesc('');
      dialog.showModal();
    } else if (!createOpen && dialog.open) {
      dialog.close();
    }
  }, [createOpen]);

  function handleAuthorAction(fn: () => void): void {
    if (!canAuthor) {
      openLoginDialog();
      return;
    }
    fn();
  }

  async function handleCreateSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newTitle.trim()) {
      return;
    }
    try {
      const { quest } = await api.createQuest(newTitle.trim(), newDesc.trim());
      setCreateOpen(false);
      onNavigate(`/builder/${quest.id}`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 401) {
          setCreateOpen(false);
          openLoginDialog();
          return;
        }
        setErrorMsg(formatStructuredMessage(locale, { code: err.code, params: err.params }));
      }
    }
  }

  async function handleDuplicate(quest: QuestSummary) {
    try {
      await api.duplicateQuest(quest.id);
      await loadQuests(search);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 401) {
          openLoginDialog();
          return;
        }
        setErrorMsg(formatStructuredMessage(locale, { code: err.code, params: err.params }));
      }
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) {
      return;
    }
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await api.deleteQuest(target.id);
      await loadQuests(search);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 401) {
          openLoginDialog();
          return;
        }
        setErrorMsg(formatStructuredMessage(locale, { code: err.code, params: err.params }));
      }
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      await api.importQuest(parsed);
      await loadQuests(search);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 401) {
          openLoginDialog();
          return;
        }
        setErrorMsg(formatStructuredMessage(locale, { code: err.code, params: err.params }));
      } else {
        setErrorMsg(t(locale, 'msg.ERR_INVALID_IMPORT_JSON'));
      }
    }
  }

  return (
    <>
      <TopBar onNavigate={onNavigate} />
      <main id="main-content" className="qf-container" tabIndex={-1}>
        <div className="qf-catalog-header">
          <div>
            <h1 className="qf-catalog-title">{t(locale, 'catalog.title')}</h1>
            <p className="qf-catalog-subtitle">{t(locale, 'catalog.subtitle')}</p>
          </div>

          <div className="qf-controls-row">
            <button
              type="button"
              className="qf-btn qf-btn-primary"
              onClick={() => {
                handleAuthorAction(() => {
                  setCreateOpen(true);
                });
              }}
            >
              + {t(locale, 'catalog.createQuest')}
            </button>
            <button
              type="button"
              className="qf-btn"
              onClick={() => {
                handleAuthorAction(() => importInputRef.current?.click());
              }}
            >
              {t(locale, 'catalog.importJson')}
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="visually-hidden"
              aria-label={t(locale, 'catalog.importJson')}
              onChange={(e) => void handleImportFile(e)}
            />
          </div>
        </div>

        <div className="qf-catalog-toolbar">
          <div className="qf-search-wrap">
            <label htmlFor={searchId} className="visually-hidden">
              {t(locale, 'catalog.searchLabel')}
            </label>
            <input
              id={searchId}
              type="search"
              className="qf-input"
              placeholder={t(locale, 'catalog.searchPlaceholder')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
            />
          </div>
          {!canAuthor && <span className="qf-badge">{t(locale, 'catalog.authRequiredHint')}</span>}
        </div>

        {errorMsg && (
          <div role="alert" className="qf-error-banner">
            {errorMsg}
          </div>
        )}

        {loading ? (
          <p>{t(locale, 'player.loading')}</p>
        ) : quests.length === 0 ? (
          <div className="qf-card">
            <p style={{ margin: 0 }}>{t(locale, 'catalog.empty')}</p>
          </div>
        ) : (
          <div className="qf-quest-grid">
            {quests.map((quest) => {
              const canPlay = quest.hasStartScene && quest.sceneCount > 0;
              return (
                <article key={quest.id} className="qf-card qf-quest-card">
                  <div>
                    <div
                      className="qf-controls-row"
                      style={{ justifyContent: 'space-between', marginBottom: '0.6rem' }}
                    >
                      <span
                        className={`qf-badge ${quest.playable ? 'qf-badge-win' : 'qf-badge-lose'}`}
                      >
                        {t(locale, quest.playable ? 'catalog.ready' : 'catalog.notReady')}
                      </span>
                      {!quest.hasStartScene && (
                        <span className="qf-badge">{t(locale, 'catalog.noStartHint')}</span>
                      )}
                    </div>

                    <h2 className="qf-quest-card-title">{quest.title}</h2>
                    {quest.description && <p className="qf-quest-card-desc">{quest.description}</p>}
                  </div>

                  <div>
                    <div className="qf-quest-card-meta" style={{ marginBottom: '0.85rem' }}>
                      <span className="qf-badge">
                        {t(locale, 'catalog.scenesCount', { count: quest.sceneCount })}
                      </span>
                      <span className="qf-badge">
                        {t(locale, 'catalog.winsCount', { count: quest.winCount })}
                      </span>
                      <span className="qf-badge">
                        {t(locale, 'catalog.lossesCount', { count: quest.loseCount })}
                      </span>
                      <span className="qf-badge">
                        {t(locale, 'catalog.varsCount', { count: quest.variableCount })}
                      </span>
                    </div>

                    <div className="qf-quest-card-actions">
                      <button
                        type="button"
                        className="qf-btn qf-btn-primary"
                        disabled={!canPlay}
                        onClick={() => {
                          onNavigate(`/play/${quest.id}`);
                        }}
                      >
                        {t(locale, 'catalog.play')}
                      </button>

                      {canAuthor && (
                        <button
                          type="button"
                          className="qf-btn"
                          onClick={() => {
                            onNavigate(`/builder/${quest.id}`);
                          }}
                        >
                          {t(locale, 'catalog.edit')}
                        </button>
                      )}

                      <a
                        className="qf-btn qf-link-btn"
                        href={api.exportHtmlUrl(quest.id, locale, theme)}
                        download
                      >
                        {t(locale, 'catalog.exportHtml')}
                      </a>

                      <a className="qf-btn qf-link-btn" href={api.exportJsonUrl(quest.id)} download>
                        {t(locale, 'catalog.exportJson')}
                      </a>

                      {canAuthor && (
                        <>
                          <button
                            type="button"
                            className="qf-btn"
                            onClick={() => void handleDuplicate(quest)}
                          >
                            {t(locale, 'catalog.duplicate')}
                          </button>
                          <button
                            type="button"
                            className="qf-btn qf-btn-danger"
                            onClick={() => {
                              setPendingDelete(quest);
                            }}
                          >
                            {t(locale, 'catalog.delete')}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <dialog
        ref={createDialogRef}
        className="qf-dialog"
        aria-labelledby={createDialogTitleId}
        onClose={() => {
          if (createDialogRef.current) {
            createDialogRef.current.returnValue = '';
          }
          setCreateOpen(false);
        }}
      >
        <h2 id={createDialogTitleId} className="qf-dialog-title">
          {t(locale, 'catalog.createQuest')}
        </h2>
        <form className="qf-form-stack" onSubmit={(e) => void handleCreateSubmit(e)}>
          <div>
            <label htmlFor={newTitleId} className="qf-label">
              {t(locale, 'catalog.createTitleLabel')}
            </label>
            <input
              id={newTitleId}
              className="qf-input"
              type="text"
              required
              autoFocus
              value={newTitle}
              onChange={(e) => {
                setNewTitle(e.target.value);
              }}
            />
          </div>
          <div>
            <label htmlFor={newDescId} className="qf-label">
              {t(locale, 'catalog.createDescLabel')}
            </label>
            <textarea
              id={newDescId}
              className="qf-textarea"
              rows={3}
              value={newDesc}
              onChange={(e) => {
                setNewDesc(e.target.value);
              }}
            />
          </div>
          <div className="qf-dialog-actions">
            <button
              type="button"
              className="qf-btn"
              onClick={() => {
                setCreateOpen(false);
              }}
            >
              {t(locale, 'catalog.cancel')}
            </button>
            <button type="submit" className="qf-btn qf-btn-primary">
              {t(locale, 'catalog.createSubmit')}
            </button>
          </div>
        </form>
      </dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t(locale, 'catalog.confirmDeleteTitle')}
        body={t(locale, 'catalog.confirmDeleteBody', { title: pendingDelete?.title ?? '' })}
        confirmLabel={t(locale, 'catalog.delete')}
        cancelLabel={t(locale, 'catalog.cancel')}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => {
          setPendingDelete(null);
        }}
      />
    </>
  );
}
