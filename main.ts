import { Command } from "https://deno.land/x/cliffy/command/mod.ts";

const YT_DLP_VERSION = "2024.09.27";
const FILENAME_WIN = "yt-dlp.exe";
const FILENAME_MACOS = "yt-dlp_macos";
const FILENAME_LINUX = "yt-dlp_linux";
const OS = Deno.build.os;
const AUDIO_ID: number = 140;
const VIDEO_ID: number = 609;

/**
 * Checks if yt-dlp is installed and accessible in the system PATH.
 * @returns A promise that resolves to true if yt-dlp is installed, false otherwise.
 */
async function checkYtDlpInstalled(): Promise<boolean> {
    const command = new Deno.Command("yt-dlp", { args: ["--version"] });
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
        console.error("Error occurred during download:");
        console.error(new TextDecoder().decode(stderr));
    }
}

/**
 * Merges video and audio files using ffmpeg and then deletes the input files.
 *
 * This function performs the following steps:
 * 1. Executes an ffmpeg command to merge 'my_video.mp4' and 'my_audio.m4a' into an output.mp4.
 * 2. Waits for the ffmpeg process to complete.
 * 3. If successful, deletes the input files ('my_video.mp4' and 'my_audio.m4a').
 *
 * @param url - The video URL to download audio from.
 * @param ytDlpCommand - yt-dlp command for OS, depending on installation (GitHub or package manager)
 *
 * @throws {Error} If the ffmpeg process exits with a non-zero status code.
 * @throws {Deno.errors.NotFound} If input files are not found.
 * @throws {Deno.errors.PermissionDenied} If there's no permission to read input files or write output file.
 *
 * @returns {Promise<void>} A promise that resolves when the merge is complete and input files are deleted.
 *
 * @requires ffmpeg to be installed and accessible in the system's PATH.
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
        const title = new Deno.Command(ytDlpCommand, {
            args: ["--print", "filename", url],
        });
        const output = await title.output();
        const out = new TextDecoder().decode(
            output.success ? output.stdout : output.stderr,
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
                `ffmpeg process failed with code ${code}. Error: ${errorOutput}`,
            );
        }

        // Log success message
        console.log("ffmpeg process completed successfully");
        console.log(new TextDecoder().decode(stdout));

        // Delete input files
        await Promise.all([
            Deno.remove("my_video.mp4"),
            Deno.remove("my_audio.m4a"),
        ]);

        console.log("Merge completed and input files deleted successfully");
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error("An error occurred: ", error.message);
        } else {
            console.error("An unexpected error occurred: ", error);
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
        .description("Download high quality videos with audio, using yt-dlp")
        .arguments("<url:string>")
        .parse(Deno.args);

    const url = args[0];
    console.log("URL passed: ", url);
    const isInstalled = await checkYtDlpInstalled();
    const ytDlpCommand = getYtDlpCommand(isInstalled);

    if (!isInstalled) {
        await downloadYtDlp();
        updatePath();
    }

    try {
        // Download audio stream
        await runYtDlpCommand(url, AUDIO_ID, ytDlpCommand);
        // Download video stream
        await runYtDlpCommand(url, VIDEO_ID, ytDlpCommand);
        // Merge streams and tidy up
        await mergeAndCleanup(ytDlpCommand, url);
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error("Failed with error: ", error.message);
        } else {
            console.error("An unexpected error occurred: ", error);
        }
    }
}

if (import.meta.main) {
    main();
}
