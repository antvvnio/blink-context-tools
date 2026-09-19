const vscode = require("vscode");
const path = require("path");
const { spawn } = require("child_process");

/** @type {Map<string, { uri: import('vscode').Uri, child: import('child_process').ChildProcessWithoutNullStreams }>} */
const watchers = new Map();

let output;

function isBlinkFile(uri) {
  return uri instanceof vscode.Uri && path.extname(uri.fsPath).toLowerCase() === ".blink";
}

function uniqueUris(uris) {
  const seen = new Set();
  const result = [];

  for (const uri of uris) {
    if (!(uri instanceof vscode.Uri)) continue;

    const key = path.resolve(uri.fsPath).toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(uri);
  }

  return result;
}

function selectedBlinkFiles(clickedUri, selectedUris) {
  const selection = Array.isArray(selectedUris) && selectedUris.length > 0
    ? selectedUris
    : clickedUri
      ? [clickedUri]
      : [];

  return uniqueUris(selection).filter(isBlinkFile);
}

async function blinkFilesInFolder(folderUri) {
  return vscode.workspace.findFiles(
    new vscode.RelativePattern(folderUri, "**/*.blink"),
    "**/{node_modules,.git}/**"
  );
}

function commandForFile(fileUri, watch) {
  return {
    cwd: path.dirname(fileUri.fsPath),
    args: [path.basename(fileUri.fsPath), ...(watch ? ["--watch"] : [])]
  };
}

function appendProcessOutput(prefix, process) {
  process.stdout.on("data", data => output.append(`[${prefix}] ${data}`));
  process.stderr.on("data", data => output.append(`[${prefix}] ${data}`));
}

function runGenerate(fileUri) {
  return new Promise(resolve => {
    const { cwd, args } = commandForFile(fileUri, false);
    const label = path.basename(fileUri.fsPath);
    const child = spawn("blink", args, {
      cwd,
      windowsHide: true,
      shell: false
    });

    appendProcessOutput(label, child);

    child.once("error", error => {
      output.appendLine(`[${label}] Failed to start Blink: ${error.message}`);
      resolve({ ok: false, file: fileUri, error });
    });

    child.once("close", code => {
      resolve({ ok: code === 0, file: fileUri, code });
    });
  });
}

async function updateWatcherContext() {
  await vscode.commands.executeCommand("setContext", "blinkContext.hasWatchers", watchers.size > 0);
}

function watcherKey(uri) {
  return path.resolve(uri.fsPath).toLowerCase();
}

async function startWatch(fileUri) {
  const key = watcherKey(fileUri);
  if (watchers.has(key)) return false;

  const { cwd, args } = commandForFile(fileUri, true);
  const label = path.basename(fileUri.fsPath);
  const child = spawn("blink", args, {
    cwd,
    windowsHide: true,
    shell: false
  });

  watchers.set(key, { uri: fileUri, child });
  appendProcessOutput(`${label} watch`, child);

  child.once("error", async error => {
    output.appendLine(`[${label} watch] Failed to start Blink: ${error.message}`);
    watchers.delete(key);
    await updateWatcherContext();
    vscode.window.showErrorMessage(`Blink could not start for ${label}: ${error.message}`);
  });

  child.once("close", async code => {
    if (watchers.get(key)?.child === child) {
      watchers.delete(key);
      await updateWatcherContext();
    }
    output.appendLine(`[${label} watch] exited with code ${code ?? "unknown"}`);
  });

  await updateWatcherContext();
  return true;
}

async function stopWatch(fileUri) {
  const key = watcherKey(fileUri);
  const entry = watchers.get(key);
  if (!entry) return false;

  watchers.delete(key);
  entry.child.kill();
  await updateWatcherContext();
  return true;
}

function isInsideFolder(filePath, folderPath) {
  const relative = path.relative(path.resolve(folderPath), path.resolve(filePath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function generateFiles(files) {
  if (files.length === 0) {
    vscode.window.showInformationMessage("No .blink files selected.");
    return;
  }

  const results = await Promise.all(files.map(runGenerate));
  const failed = results.filter(result => !result.ok);

  if (failed.length > 0) {
    vscode.window.showErrorMessage(
      `Blink failed for ${failed.length} of ${files.length} file(s). See Output > Blink Context Tools.`
    );
    return;
  }

  vscode.window.showInformationMessage(`Blink generated ${files.length} file(s).`);
}

async function watchFiles(files) {
  if (files.length === 0) {
    vscode.window.showInformationMessage("No .blink files selected.");
    return;
  }

  let started = 0;
  for (const file of files) {
    if (await startWatch(file)) started++;
  }

  if (started === 0) {
    vscode.window.showInformationMessage("Selected Blink file(s) are already being watched.");
  } else {
    vscode.window.showInformationMessage(`Watching ${started} Blink file(s).`);
  }
}

async function stopFiles(files) {
  let stopped = 0;
  for (const file of files) {
    if (await stopWatch(file)) stopped++;
  }

  if (stopped === 0) {
    vscode.window.showInformationMessage("None of the selected Blink file(s) are being watched.");
  } else {
    vscode.window.showInformationMessage(`Stopped ${stopped} Blink watcher(s).`);
  }
}

function register(context, command, callback) {
  context.subscriptions.push(vscode.commands.registerCommand(command, callback));
}

async function activate(context) {
  output = vscode.window.createOutputChannel("Blink Context Tools");
  context.subscriptions.push(output);
  await updateWatcherContext();

  register(context, "blinkContext.generateSelected", async (clickedUri, selectedUris) => {
    await generateFiles(selectedBlinkFiles(clickedUri, selectedUris));
  });

  register(context, "blinkContext.watchSelected", async (clickedUri, selectedUris) => {
    await watchFiles(selectedBlinkFiles(clickedUri, selectedUris));
  });

  register(context, "blinkContext.stopWatchSelected", async (clickedUri, selectedUris) => {
    await stopFiles(selectedBlinkFiles(clickedUri, selectedUris));
  });

  register(context, "blinkContext.generateAll", async folderUri => {
    const files = await blinkFilesInFolder(folderUri);
    await generateFiles(files);
  });

  register(context, "blinkContext.watchAll", async folderUri => {
    const files = await blinkFilesInFolder(folderUri);
    await watchFiles(files);
  });

  register(context, "blinkContext.stopWatchAll", async folderUri => {
    const matching = [];

    for (const { uri } of watchers.values()) {
      if (isInsideFolder(uri.fsPath, folderUri.fsPath)) {
        matching.push(uri);
      }
    }

    if (matching.length === 0) {
      vscode.window.showInformationMessage("No Blink watchers are active in this folder.");
      return;
    }

    await stopFiles(matching);
  });

  context.subscriptions.push({
    dispose() {
      for (const { child } of watchers.values()) {
        child.kill();
      }
      watchers.clear();
    }
  });
}

function deactivate() {
  for (const { child } of watchers.values()) {
    child.kill();
  }
  watchers.clear();
}

module.exports = { activate, deactivate };
