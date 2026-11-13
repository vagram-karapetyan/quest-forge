import { formatStructuredMessage, t, type QuestAnalysis } from '@quest-forge/engine';
import { useAppPreferences } from '../../state/preferences.js';

type QuestAnalyzerPanelProps = {
  analysis: QuestAnalysis;
  onJumpToScene: (sceneId: string) => void;
};

export function QuestAnalyzerPanel({ analysis, onJumpToScene }: QuestAnalyzerPanelProps) {
  const { locale } = useAppPreferences();

  return (
    <div className="qf-inspector-stack">
      <div className="qf-analyzer-summary">
        <div className="qf-controls-row">
          <span className={`qf-badge ${analysis.playable ? 'qf-badge-win' : 'qf-badge-lose'}`}>
            {analysis.playable ? t(locale, 'catalog.ready') : t(locale, 'catalog.notReady')}
          </span>
          <span className="qf-badge">
            {t(locale, 'builder.analyzer.reachableRatio', {
              reachable: analysis.stats.reachableCount,
              total: analysis.stats.sceneCount,
            })}
          </span>
        </div>

        <div className="qf-controls-row">
          <span className="qf-badge">
            {t(locale, 'catalog.winsCount', { count: analysis.stats.winCount })}
          </span>
          <span className="qf-badge">
            {t(locale, 'catalog.lossesCount', { count: analysis.stats.loseCount })}
          </span>
          <span className="qf-badge">
            {t(locale, 'catalog.varsCount', { count: analysis.stats.variableCount })}
          </span>
        </div>
      </div>

      {analysis.issues.length === 0 ? (
        <div className="qf-ending-banner win">{t(locale, 'builder.analyzer.noIssues')}</div>
      ) : (
        <ul className="qf-issue-list">
          {analysis.issues.map((issue, idx) => {
            const msg = formatStructuredMessage(locale, {
              code: issue.code,
              params: issue.params,
            });
            const badgeClass =
              issue.severity === 'error'
                ? 'qf-badge-lose'
                : issue.severity === 'warning'
                  ? 'qf-badge-warn'
                  : 'qf-badge-info';
            const severityLabel =
              issue.severity === 'error' ? 'ERR' : issue.severity === 'warning' ? 'WARN' : 'INFO';

            return (
              <li key={`${issue.code}-${issue.sceneId ?? 'q'}-${idx}`} className="qf-issue-item">
                <div className="qf-issue-head">
                  <span className={`qf-badge ${badgeClass}`}>{severityLabel}</span>
                  {issue.sceneId && (
                    <button
                      type="button"
                      className="qf-btn qf-btn-xs"
                      onClick={() => {
                        if (issue.sceneId) {
                          onJumpToScene(issue.sceneId);
                        }
                      }}
                    >
                      {t(locale, 'builder.analyzer.jumpToScene')}
                    </button>
                  )}
                </div>
                <p className="qf-issue-text">{msg}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
