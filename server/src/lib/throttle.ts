export function throttle(concurrency: number, rpm: number) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || !Number.isInteger(rpm) || rpm < 1) {
    throw new RangeError('concurrency and rpm must be positive integers');
  }
  let active = 0;
  let nextStart = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const queue: (() => void)[] = [];

  function drain() {
    if (timer || active >= concurrency || queue.length === 0) return;
    const delay = Math.max(0, nextStart - Date.now());
    if (delay > 0) {
      timer = setTimeout(() => { timer = undefined; drain(); }, delay);
      return;
    }
    active++;
    nextStart = Date.now() + 60_000 / rpm;
    queue.shift()!();
    drain();
  }

  return function schedule<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        Promise.resolve().then(operation).then(resolve, reject).finally(() => { active--; drain(); });
      });
      drain();
    });
  };
}
