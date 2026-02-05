/**
 * CLI Runner - Execute shell commands with secure credential injection
 */

import { spawn } from "child_process";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
}

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  stdin?: string;
}

/**
 * Execute a CLI command and return the result
 */
export async function execCommand(
  command: string,
  args: string[],
  options: ExecOptions = {}
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      ...options.env,
    };

    const proc = spawn(command, args, {
      cwd: options.cwd,
      env,
      timeout: options.timeout ?? 60000,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    if (options.stdin) {
      proc.stdin.write(options.stdin);
      proc.stdin.end();
    }

    proc.on("close", (code) => {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? 0,
        success: code === 0,
      });
    });

    proc.on("error", (err) => {
      resolve({
        stdout: "",
        stderr: err.message,
        exitCode: 1,
        success: false,
      });
    });
  });
}

/**
 * Execute a git command
 */
export async function execGit(
  args: string[],
  options: ExecOptions = {}
): Promise<ExecResult> {
  return execCommand("git", args, options);
}

/**
 * Execute a heroku command with API key
 */
export async function execHeroku(
  args: string[],
  apiKey: string,
  options: ExecOptions = {}
): Promise<ExecResult> {
  return execCommand("heroku", args, {
    ...options,
    env: {
      ...options.env,
      HEROKU_API_KEY: apiKey,
    },
  });
}

/**
 * Parse JSON output safely
 */
export function parseJsonOutput<T>(output: string): T | null {
  try {
    return JSON.parse(output);
  } catch {
    return null;
  }
}
