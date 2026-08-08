/* Pyodide 运行 Worker（classic worker，免打包）。
 * 通过本地 /pyodide 运行时加载 Python，满足离线运行要求。
 * indexURL 由主线程在 init 消息中传入（完整 origin），避免相对路径解析失败。 */
/* eslint-disable */
let pyodide = null;
let loading = null;
let indexURL = null;

self.onmessage = async function (e) {
  const msg = e.data;
  if (msg.type === 'init') {
    indexURL = msg.indexURL;
    importScripts(indexURL + 'pyodide.js');
    self.postMessage({ type: 'ready' });
    return;
  }
  if (!indexURL) {
    self.postMessage({ type: 'error', value: 'Pyodide worker 未初始化' });
    return;
  }
  const { code } = msg;
  try {
    if (!pyodide) {
      self.postMessage({ type: 'status', value: '正在加载 Python 运行时…' });
      if (!loading) loading = loadPyodide({ indexURL });
      pyodide = await loading;
    }
    const logs = [];
    pyodide.setStdout({ batched: (s) => logs.push(s) });
    pyodide.setStderr({ batched: (s) => logs.push('[err] ' + s) });
    // 注入小车 API，便于示例代码驱动仿真
    await pyodide.runPythonAsync(
      'class __Car:\n' +
      "  def forward(self): globals()['__cmd_last']='F'\n" +
      "  def back(self): globals()['__cmd_last']='B'\n" +
      "  def left(self): globals()['__cmd_last']='L'\n" +
      "  def right(self): globals()['__cmd_last']='R'\n" +
      "  def forward_left(self): globals()['__cmd_last']='LF'\n" +
      "  def forward_right(self): globals()['__cmd_last']='RF'\n" +
      "  def back_left(self): globals()['__cmd_last']='LB'\n" +
      "  def back_right(self): globals()['__cmd_last']='RB'\n" +
      "  def stop(self): globals()['__cmd_last']='S'\n" +
      "globals()['__cmd_last']=None\n" +
      'car=__Car()\n'
    );
    const result = await pyodide.runPythonAsync(code);
    const carCmd = pyodide.globals.get('__cmd_last');
    self.postMessage({ type: 'done', logs, result: result == null ? '' : String(result), carCmd: carCmd ?? undefined });
  } catch (err) {
    self.postMessage({ type: 'error', value: String((err && err.message) || err) });
  }
};
