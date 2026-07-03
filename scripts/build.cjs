const { existsSync, readdirSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");

function bin(name) {
  return resolve(root, "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);
}

function packageFile(...parts) {
  return resolve(root, "node_modules", ...parts);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    ...options,
  });

  if (result.error) {
    console.error(result.error.message);
  }

  return result.status ?? 1;
}

function runRequired(command, args, options) {
  const status = run(command, args, options);
  if (status !== 0) {
    process.exit(status);
  }
}

function serverBuildArgs() {
  return [
    "./server/_core/index.ts",
    "--platform=node",
    "--packages=external",
    "--bundle",
    "--format=esm",
    "--alias:@shared=./shared",
    "--outdir=dist",
  ];
}

function viteCommand() {
  if (process.platform === "win32") {
    return {
      command: process.execPath,
      args: [packageFile("vite", "bin", "vite.js"), "build", "--configLoader", "runner"],
    };
  }

  return {
    command: bin("vite"),
    args: ["build", "--configLoader", "runner"],
  };
}

function findWindowsEsbuildBinary(baseRoot) {
  const pnpmDir = join(baseRoot, "node_modules", ".pnpm");
  const prefix = "@esbuild+win32-x64@";
  const packageDir = readdirSync(pnpmDir).find((entry) => entry.startsWith(prefix));
  if (!packageDir) {
    throw new Error("Could not find the Windows esbuild binary package.");
  }

  return join(pnpmDir, packageDir, "node_modules", "@esbuild", "win32-x64", "esbuild.exe");
}

function esbuildCommand(baseRoot = root) {
  if (process.platform === "win32") {
    return findWindowsEsbuildBinary(baseRoot);
  }

  return bin("esbuild");
}

function directServerBuild() {
  return run(esbuildCommand(), serverBuildArgs());
}

function findFreeDrive() {
  for (const letter of "ZYXWVUTSRQPONMLKJIHGFED") {
    const drive = `${letter}:`;
    if (!existsSync(`${drive}\\`)) {
      return drive;
    }
  }

  return null;
}

function substServerBuild() {
  const drive = findFreeDrive();
  if (!drive) {
    return 1;
  }

  const substStatus = run("subst", [drive, root]);
  if (substStatus !== 0) {
    return substStatus;
  }

  try {
    const mappedRoot = `${drive}\\`;
    const esbuild = esbuildCommand(mappedRoot);
    const result = spawnSync(esbuild, serverBuildArgs(), {
      cwd: mappedRoot,
      stdio: "inherit",
      shell: false,
    });

    return result.status ?? 1;
  } finally {
    run("subst", [drive, "/D"]);
  }
}

const vite = viteCommand();
runRequired(vite.command, vite.args);

if (process.platform === "win32") {
  const serverStatus = substServerBuild();
  if (serverStatus === 0) {
    process.exit(0);
  }

  console.warn("Temporary drive-root server bundle failed; retrying directly.");
  process.exit(directServerBuild());
}

const serverStatus = directServerBuild();
if (serverStatus === 0) {
  process.exit(0);
}

process.exit(serverStatus);
