import { runTask137Tests } from './task137-production-release-control.test.js';

if (process.argv[1]?.includes('task137-release-control')) {
  runTask137Tests().then((res) => {
    process.exit(res.failed > 0 ? 1 : 0);
  }).catch((err) => {
    console.error('Fatal release control test failure:', err);
    process.exit(1);
  });
}

export { runTask137Tests };
