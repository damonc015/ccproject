import { USE_LOCAL_API } from '../config';

export function LocalNotice() {
  return USE_LOCAL_API ? <div className="banner">Local demo: edits are saved, but live collaboration and code execution are simulated.</div> : null;
}
