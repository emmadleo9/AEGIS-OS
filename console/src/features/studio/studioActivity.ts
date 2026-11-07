export type StudioTask = {
  at: string;
  taskType: string;
  model: string;
  handledBy: string;
  responseTime: string;
  status: 'complete' | 'failed';
};

export type StudioError = { at: string; message: string };
export type StudioActivity = { tasks: StudioTask[]; errors: StudioError[] };

const STORAGE_KEY = 'krynara_studio_activity';
const CHANGE_EVENT = 'krynara:studio-activity-change';
const emptyActivity = (): StudioActivity => ({ tasks: [], errors: [] });

export function getStudioActivity(): StudioActivity {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return emptyActivity();
    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object') return emptyActivity();
    const activity = parsed as Partial<StudioActivity>;
    return {
      tasks: Array.isArray(activity.tasks) ? activity.tasks.slice(0, 50) : [],
      errors: Array.isArray(activity.errors) ? activity.errors.slice(0, 50) : [],
    };
  } catch (reason) {
    console.error('Could not read AI Studio activity:', reason);
    return emptyActivity();
  }
}

function saveActivity(activity: StudioActivity) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(activity));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch (reason) {
    console.error('Could not save AI Studio activity:', reason);
  }
}

export function recordStudioTask(task: StudioTask) {
  const activity = getStudioActivity();
  activity.tasks.unshift(task);
  activity.tasks = activity.tasks.slice(0, 50);
  saveActivity(activity);
}

export function recordStudioError(error: StudioError) {
  const activity = getStudioActivity();
  activity.errors.unshift(error);
  activity.errors = activity.errors.slice(0, 50);
  saveActivity(activity);
}

export function subscribeToStudioActivity(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}
