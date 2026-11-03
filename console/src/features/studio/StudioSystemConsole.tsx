import { useEffect, useState } from 'react';
import { getStudioActivity, subscribeToStudioActivity } from './studioActivity';

type KeyStatus = { id: string; connected: boolean };

export function StudioSystemConsole() {
  const [activity, setActivity] = useState(getStudioActivity);
  const [tab, setTab] = useState<'tasks' | 'errors'>('tasks');
  const [missingKeys, setMissingKeys] = useState<string[]>([]);

  useEffect(() => subscribeToStudioActivity(() => setActivity(getStudioActivity())), []);

  useEffect(() => {
    let active = true;
    void fetch('/api/keys')
      .then(async (response) => {
        if (!response.ok) throw new Error(`Gateway returned HTTP ${response.status}`);
        const data = await response.json() as { keys?: KeyStatus[] };
        if (!active) return;
        const connected = new Set((data.keys ?? []).filter((key) => key.connected).map((key) => key.id));
        setMissingKeys(['NV_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'TAVILY_API_KEY'].filter((key) => !connected.has(key)));
      })
      .catch((reason: unknown) => console.error('Could not load API key status for the system console:', reason));
    return () => { active = false; };
  }, []);

  return (
    <section className="studio-console-panel hud-frame" aria-label="AI Studio tasks and errors">
      <div className="studio-console-header">
        <div className="studio-console-title">
          <strong>AI STUDIO SYSTEM CONSOLE</strong>
          <span>Recent tasks and errors</span>
        </div>
        <div className="studio-console-tabs" role="tablist" aria-label="Console tabs">
          <button type="button" role="tab" aria-selected={tab === 'tasks'} className={tab === 'tasks' ? 'device-tab active' : 'device-tab'} onClick={() => setTab('tasks')}>TASKS ({activity.tasks.length})</button>
          <button type="button" role="tab" aria-selected={tab === 'errors'} className={tab === 'errors' ? 'device-tab active' : 'device-tab'} onClick={() => setTab('errors')}>ERRORS ({activity.errors.length + missingKeys.length})</button>
        </div>
      </div>
      <div className="studio-console-body" role="tabpanel">
        {tab === 'tasks' ? (
          <div className="studio-task-list">
            {activity.tasks.length === 0
              ? <p className="inline-status">No NOVA tasks recorded yet.</p>
              : activity.tasks.map((task, index) => (
                <div className="studio-task-row" key={`${task.at}-${index}`}>
                  <time>{new Date(task.at).toLocaleTimeString()}</time>
                  <strong>{task.taskType}</strong>
                  <span>{task.model}</span>
                  <span>{task.handledBy}</span>
                  <span>{task.responseTime}</span>
                  <span className={`studio-task-status${task.status === 'failed' ? ' is-error' : ''}`}>{task.status.toUpperCase()}</span>
                </div>
              ))}
          </div>
        ) : (
          <div className="studio-error-list" aria-live="polite">
            {missingKeys.map((key) => <p className="studio-error-row" key={key}><time>CONFIG</time><span>API key missing: {key}</span></p>)}
            {activity.errors.map((error, index) => (
              <p className="studio-error-row" key={`${error.at}-${index}`}>
                <time>{new Date(error.at).toLocaleTimeString()}</time>
                <span>{error.message}</span>
              </p>
            ))}
            {missingKeys.length === 0 && activity.errors.length === 0 && <p className="inline-status">No active errors or missing API keys.</p>}
          </div>
        )}
      </div>
    </section>
  );
}
