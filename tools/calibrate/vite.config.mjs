// Serves the calibration pages: npm run calibrate, then open one in the simulator or on the glasses.
export default { root: new URL('.', import.meta.url).pathname, server: { host: '127.0.0.1', port: 5199, strictPort: true } };
