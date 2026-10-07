export type Route =
  | { name: 'dashboard' }
  | { name: 'library' }
  | { name: 'practice'; storyId?: string }
  | { name: 'history' };

export type Navigate = (route: Route) => void;
