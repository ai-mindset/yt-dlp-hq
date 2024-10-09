import { Command } from "https://deno.land/x/cliffy/command/mod.ts";

const YT_DLP_VERSION = "2024.09.27";
const FILENAME_WIN = "yt-dlp.exe";
const FILENAME_MACOS = "yt-dlp_macos";
const FILENAME_LINUX = "yt-dlp_linux";
const OS = Deno.build.os;
const AUDIO_ID: number = 140;
const VIDEO_ID: number = 609;

/**
 * Checks if a package is installed and accessible in the system PATH.
 * @param {string} packageName The package whose installation status we want to check
 * @returns A promise that resolves to true if `packageName` is installed, false otherwise.
 */
async function checkPackageInstalled(packageName: string): Promise<boolean> {
    const command = new Deno.Command(packageName, { args: ["--help"] });
    try {
        const { code } = await command.output();
        return code === 0;
    } catch {
        return false;
    }
}

/**
 * Gets the latest yt-dlp executable URL for the current the operating system.
 * @param os - The operating system used (windows, linux, or darwin).
 * @returns The URL to download yt-dlp for the specified OS.
 * @throws Will throw an error for unsupported operating systems.
 */
function getYtDlpUrl(os: string): string {
    const baseUrl =
        `https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/`;
    switch (os) {
        case "windows":
            return `${baseUrl}${FILENAME_WIN}`;
        case "linux":
            return `${baseUrl}${FILENAME_LINUX}`;
        case "darwin":
            return `${baseUrl}${FILENAME_MACOS}`;
        default:
            throw new Error(`Unsupported OS: ${os}`);
    }
}

/**
 * Returns the OS-appropriate executable yt-dlp filename.
 * @param os - The operating system used (windows, linux, or darwin).
 * @returns The filename for yt-dlp on the specified OS.
 * @throws Will throw an error for unsupported operating systems.
 */
function getYtDlpFileName(os: string): string {
    switch (os) {
        case "windows":
            return FILENAME_WIN;
        case "linux":
            return FILENAME_LINUX;
        case "darwin":
            return FILENAME_MACOS;
        default:
            throw new Error(`Unsupported OS: ${os}`);
    }
}

/**
 * Downloads the appropriate yt-dlp executable for the current operating system.
 * Saves the executable on the current directory.
 * Changes file mode to 755 (executable).
 * @throws Will throw an error if the download fails.
 */
async function downloadYtDlp(): Promise<void> {
    const url = getYtDlpUrl(OS);
    const fileName = getYtDlpFileName(OS);

    console.log(`Downloading yt-dlp for ${OS}...`);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download yt-dlp: ${response.statusText}`);
    }

    const fileData = await response.arrayBuffer();
    await Deno.writeFile(fileName, new Uint8Array(fileData));
    console.log(`Make ${fileName} executable...`);
    await Deno.chmod(fileName, 0o755); // Make the file executable
}

/**
 * Updates the PATH environment variable to include the current directory.
 * This ensures that the downloaded yt-dlp can be executed without specifying the full path.
 */
function updatePath(): void {
    const currentDir = Deno.cwd();
    const path = Deno.env.get("PATH") || "";
    if (!path.includes(currentDir)) {
        Deno.env.set(
            "PATH",
            `${currentDir}${OS === "windows" ? ";" : ":"}${path}`,
        );
        console.log("PATH updated");
    }
}

/**
 * Gets the appropriate yt-dlp command based on the current operating system.
 * If yt-dlp is installed from a package manager, `yt-dlp` is the command for Unix, `yt-dlp.exe`
 * for Windows.
 * If yt-dlp was downloaded from GitHub, this function returns the corresponding command.
 * @param isInstalled - Boolean flag signifying if yt-dlp is already installed
 * @returns The command to run yt-dlp on the current OS.
 */
function getYtDlpCommand(isInstalled: boolean): string {
    if (isInstalled) {
        return OS === "windows" ? "yt-dlp.exe" : "yt-dlp";
    }

    switch (OS) {
        case "windows":
            return FILENAME_WIN;
        case "darwin":
            return FILENAME_MACOS;
        case "linux":
            return FILENAME_LINUX;
        default:
            throw new Error(`Unsupported OS: ${OS}`);
    }
}

/**
 * Processes a filename by removing the file extension and replacing spaces with underscores.
 *
 * This function takes a filename (which may include a file extension) and performs two operations:
 * 1. Removes the file extension by splitting at the last occurrence of a period.
 * 2. Replaces all whitespace characters (spaces, tabs, line breaks) with underscores.
 *
 * @param filename - The original filename, which may include spaces and a file extension.
 * @returns A processed string with the file extension removed and spaces replaced by underscores.
 *
 * @example
 * const original = "some text goes here.mp3";
 * const processed = processFilename(original);
 * console.log(processed); // Output: "some_text_goes_here"
 */
function processFilename(filename: string): string {
    // Split the string at the last occurrence of '.'
    const [namePart] = filename.split(/\.(?=[^.]+$)/);

    // Replace spaces with underscores
    const processedName = namePart.replace(/\s+/g, "_");

    return processedName;
}

/**
 * Runs the yt-dlp command to download audio from the given URL.
 * @param url - The video URL to download audio from.
 * @param input - Format ID from `yt-dlp -F <video url>`
 * @param ytDlpCommand - yt-dlp command for OS, depending on installation (GitHub or package manager)
 * @returns A {Promise<void>} A promise that resolves when Deno.Command runs successfully
 */
async function runYtDlpCommand(
    url: string,
    input: number,
    ytDlpCommand: string,
): Promise<void> {
    // TODO: check VIDEO_ID. Rotate between different IDs, e.g. 606, 612, depending on availability
    const [mode, ext]: [string, string] = input === AUDIO_ID
        ? ["audio", "m4a"]
        : input === VIDEO_ID
        ? ["video", "mp4"]
        : (() => {
            throw new Error(
                `Invalid input. Enter  ${AUDIO_ID} (audio) or ${VIDEO_ID} (video)`,
            );
        })();

    console.log(`Downloading ${mode}...`);
    const command = new Deno.Command(ytDlpCommand, {
        args: ["-f", input.toString(), url, "-o", `my_${mode}.${ext}`],
    });

    const { code, stderr } = await command.output();

    if (code === 0) {
        console.log("Download completed successfully!");
    } else {
        console.error(
            "runYtDlpCommand(): An error occurred during download: ",
        );
        console.error(new TextDecoder().decode(stderr));
    }
}

/**
 * Determines the Linux distribution type.
 * @returns A Promise {string} indicating the distribution type: "debian", "rhel", or "unknown".
 */
async function getUnixDistroType(): Promise<string> {
    try {
        const cmd = new Deno.Command("cat", {
            args: ["/etc/os-release"],
        });
        const { code, stdout } = await cmd.output();

        if (code === 0) {
            const output = new TextDecoder().decode(stdout);

            if (
                output.toLowerCase().includes("debian") ||
                output.toLowerCase().includes("ubuntu")
            ) {
                return "debian";
            }
            if (
                output.toLowerCase().includes("rhel") ||
                output.toLowerCase().includes("fedora") ||
                output.toLowerCase().includes("centos")
            ) {
                return "rhel";
            }
        }

        // If /etc/os-release doesn't provide conclusive information, check for specific files
        const debianCheck = await Deno.stat("/etc/debian_version").catch(() =>
            null
        );
        if (debianCheck) return "debian";

        const rhelCheck = await Deno.stat("/etc/redhat-release").catch(() =>
            null
        );
        if (rhelCheck) return "rhel";

        if (OS === "darwin") return "darwin";

        // In theory we should never reach here
        return "unknown";
    } catch (error) {
        console.error("Error determining Linux distribution:", error);
        return "unknown";
    }
}

/**
 * Install package using distro's package manager
 * @param {string} distro The system's Linux distribution
 * @param {string} packageName The package you want to install, as found in the package manager's registry
 * @returns {boolean} Flag signifying package installation success (true) or fail (false)
 */
async function installFromPackageManager(
    distro: string,
    packageName: string,
): Promise<boolean> {
    const packageManager = distro === "debian"
        ? ["apt", "update"]
        : distro === "rhel"
        ? ["dnf", "check-update"]
        : distro === "darwin"
        ? ["brew", "update"]
        : ["unknown", "unknown"];

    let cmd = "";

    // Debian and rhel require sudo for package manager to install package
    if (distro !== "darwin") {
        cmd = "sudo";
    }
    if (distro === "darwin") {
        cmd = "brew";
    }

    if (packageManager[0] === "unknown") {
        throw new Error("Unsupported Linux distribution");
    }

    try {
        const updateCmd = new Deno.Command(cmd, {
            args: [packageManager[0], packageManager[1]],
        });
        const updateResult = await updateCmd.output();
        const updateStdout: string = new TextDecoder().decode(
            updateResult.stdout,
        );
        if (updateStdout.length === 0) {
            console.error("Failed to update package list");
            return false;
        }
        const installCmd = new Deno.Command(cmd, {
            args: [packageManager[0], "install", "-y", packageName],
        });
        const installResult = await installCmd.output();
        if (!installResult.success) {
            console.error(`Failed to install ${packageName}`);
            return false;
        }

        return true;
    } catch (error) {
        console.error("Error installing dependencies: ", error);
        return false;
    }
}

/**
 * Updates Linux package manager list and installs FFmpeg.
 * FFmpeg installation is more complex and varies by OS
 * This is a simplified version that assumes you're on a system with a package manager
 * @returns A boolean indicating if the installation was successful.
 */
async function installFfmpeg(): Promise<boolean> {
    const distro = await getUnixDistroType();
    try {
        // Update apt package list
        if (OS === "linux") {
            if (distro === "debian") {
                return await installFromPackageManager(distro, "ffmpeg");
            }
            if (distro === "rhel") {
                return await installFromPackageManager(distro, "ffmpeg-free");
            }
        }

        if (OS === "darwin") {
            return await installFromPackageManager(distro, "ffmpeg");
        }

        if (OS === "windows") {
            console.log("Please install FFmpeg manually on Windows.");
            console.log(
                "Visit https://ffmpeg.org/download.html for instructions.",
            );
            throw new Error("FFmpeg was not installed");
        }

        // Return false unless a conditional evaluates to true
        return false;
    } catch (error) {
        console.error("Error during FFmpeg installation:", error);
        return false;
    }
}

/**
 * Merges video and audio files using FFmpeg and then deletes the input files.
 *
 * This function performs the following steps:
 * 1. Executes an FFmpeg command to merge 'my_video.mp4' and 'my_audio.m4a' into an output.mp4.
 * 2. Waits for the FFmpeg process to complete.
 * 3. If successful, deletes the input files ('my_video.mp4' and 'my_audio.m4a').
 *
 * @param url - The video URL to download audio from.
 * @param ytDlpCommand - yt-dlp command for OS, depending on installation (GitHub or package manager)
 *
 * @throws {Error} If the FFmpeg process exits with a non-zero status code.
 * @throws {Deno.errors.NotFound} If input files are not found.
 * @throws {Deno.errors.PermissionDenied} If there's no permission to read input files or write output file.
 *
 * @returns {Promise<void>} A promise that resolves when the merge is complete and input files are deleted.
 *
 * @requires FFmpeg to be installed and accessible in the system's PATH.
 * @requires 'my_video.mp4' and 'my_audio.m4a' to exist in the same directory as the script.
 * @requires Deno to be run with --allow-run, --allow-read, and --allow-write permissions.
 *
 * @example
 * ```typescript
 * try {
 *   await mergeAndCleanup();
 *   console.log("Video processing completed successfully.");
 * } catch (error) {
 *   console.error("Video processing failed:", error.message);
 * }
 * ```
 */
// TODO: Split function into two. merge() and cleanup()
async function mergeAndCleanup(
    url: string,
    ytDlpCommand: string,
): Promise<void> {
    try {
        // FIXME
        const title = new Deno.Command(ytDlpCommand, {
            args: ["--print", "filename", url],
        });
        const titleOut = await title.output();
        const out = new TextDecoder().decode(
            titleOut.success ? titleOut.stdout : titleOut.stderr,
        );
        const videoTitle = processFilename(out.trim());

        // Create a new command
        const ffmpegCommand = new Deno.Command("ffmpeg", {
            args: [
                "-i",
                "my_video.mp4",
                "-i",
                "my_audio.m4a",
                "-c:v",
                "copy",
                "-c:a",
                "aac",
                "-strict",
                "experimental",
                `${videoTitle}.mp4`,
            ],
        });

        // Execute the command
        const { code, stdout, stderr } = await ffmpegCommand.output();

        // Check if the command was successful
        if (code !== 0) {
            const errorOutput = new TextDecoder().decode(stderr);
            throw new Error(
                `FFmpeg process failed with code ${code}. Error: ${errorOutput}`,
            );
        }

        // Log success message
        console.log("FFmpeg process completed successfully");
        console.log(new TextDecoder().decode(stdout));

        // Delete input files
        await Promise.all([
            Deno.remove("my_video.mp4"),
            Deno.remove("my_audio.m4a"),
        ]);

        console.log("Merge completed and input files deleted successfully");
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error("mergeAndCleanup(): Error: ", error.message);
        } else {
            console.error(
                "mergeAndCleanup(): An unexpected error occurred: ",
                error,
            );
        }
        throw error; // Re-throw the error for the caller to handle
    }
}

/**
 * Main function that orchestrates the yt-dlp download and execution process.
 * It checks for yt-dlp installation, downloads it if necessary, and runs the video download command.
 * @example
 * $ deno run -A main.ts https://youtu.be/dQw4w9WgXcQ
 */
async function main() {
    const { args } = await new Command()
        .name("yt-dlp-hq")
        .version("1.0.0")
        .description(
            "Download high quality videos with audio, using yt-dlp and FFmpeg",
        )
        .arguments("<url:string>")
        .parse(Deno.args);

    const url = args[0];
    const isYtdlpInstalled = await checkPackageInstalled("yt-dlp");
    const isFfmpegInstalled = await checkPackageInstalled("ffmpeg");
    const ytDlpCommand = getYtDlpCommand(isYtdlpInstalled);

    if (!isYtdlpInstalled) {
        await downloadYtDlp();
        updatePath();
    }
    if (!isFfmpegInstalled) {
        await installFfmpeg();
        updatePath();
    }

    try {
        // Download audio stream
        await runYtDlpCommand(url, AUDIO_ID, ytDlpCommand);
        // Download video stream
        await runYtDlpCommand(url, VIDEO_ID, ytDlpCommand);

        // Merge streams and tidy up
        await mergeAndCleanup(url, ytDlpCommand);
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error("main(): Error: ", error.message);
        } else {
            console.error("main(): An unexpected error occurred: ", error);
        }
    }
}

if (import.meta.main) {
    main();
}
