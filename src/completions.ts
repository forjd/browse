/**
 * Shell completion script generators for bash, zsh, and fish.
 */

const COMMANDS = [
	"goto",
	"text",
	"snapshot",
	"click",
	"hover",
	"fill",
	"select",
	"scroll",
	"press",
	"screenshot",
	"console",
	"network",
	"auth-state",
	"login",
	"tab",
	"flow",
	"assert",
	"healthcheck",
	"wipe",
	"benchmark",
	"viewport",
	"eval",
	"page-eval",
	"wait",
	"url",
	"back",
	"forward",
	"reload",
	"attr",
	"upload",
	"a11y",
	"quit",
	"version",
	"session",
	"ping",
	"status",
	"dialog",
	"download",
	"frame",
	"intercept",
	"cookies",
	"storage",
	"html",
	"title",
	"pdf",
	"element-count",
	"trace",
	"report",
	"init",
	"screenshots",
	"completions",
];

const GLOBAL_FLAGS = ["--timeout", "--session", "--json", "--config"];

const KNOWN_FLAGS: Record<string, string[]> = {
	goto: ["--viewport", "--device", "--preset"],
	text: [],
	snapshot: ["--json", "-i", "-f"],
	click: [],
	hover: ["--duration"],
	fill: [],
	select: [],
	scroll: [],
	press: [],
	screenshot: ["--viewport", "--selector", "--diff", "--threshold"],
	console: ["--level", "--keep", "--json"],
	network: ["--all", "--keep", "--json"],
	"auth-state": [],
	login: ["--env"],
	tab: [],
	flow: ["--var", "--continue-on-error", "--reporter", "--dry-run", "--stream"],
	assert: ["--var", "--json"],
	healthcheck: ["--var", "--no-screenshots", "--reporter", "--parallel", "--concurrency"],
	wipe: [],
	benchmark: ["--iterations"],
	viewport: ["--device", "--preset"],
	eval: [],
	"page-eval": [],
	wait: [],
	url: [],
	back: [],
	forward: [],
	reload: ["--hard"],
	attr: [],
	upload: [],
	a11y: ["--standard", "--json", "--include", "--exclude"],
	quit: [],
	version: [],
	session: ["--isolated"],
	ping: [],
	status: [],
	dialog: [],
	download: ["--save-to"],
	frame: [],
	intercept: ["--status", "--body", "--content-type"],
	cookies: ["--domain", "--json"],
	storage: ["--json"],
	html: [],
	title: [],
	pdf: [],
	"element-count": [],
	trace: ["--screenshots", "--snapshots", "--out"],
	report: ["--out", "--title", "--screenshots"],
	init: ["--force"],
	screenshots: ["--older-than"],
	completions: [],
};

export function generateBashCompletions(): string {
	const cmdList = COMMANDS.join(" ");
	const globalList = GLOBAL_FLAGS.join(" ");

	const cases: string[] = [];
	for (const cmd of COMMANDS) {
		const flags = [...(KNOWN_FLAGS[cmd] ?? []), ...GLOBAL_FLAGS];
		if (flags.length > 0) {
			cases.push(`        ${cmd})\n            COMPREPLY=( $(compgen -W "${flags.join(" ")}" -- "$cur") )`);
		}
	}

	return `# bash completion for browse
# Add to ~/.bashrc: eval "$(browse completions bash)"

_browse_completions() {
    local cur prev cmd
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"

    # Find the command (first non-flag argument after 'browse')
    cmd=""
    for ((i=1; i < COMP_CWORD; i++)); do
        case "\${COMP_WORDS[i]}" in
            --timeout|--session|--config)
                ((i++))
                ;;
            --json)
                ;;
            -*)
                ;;
            *)
                cmd="\${COMP_WORDS[i]}"
                break
                ;;
        esac
    done

    # Complete command names if no command found yet
    if [[ -z "$cmd" ]]; then
        if [[ "$cur" == -* ]]; then
            COMPREPLY=( $(compgen -W "${globalList}" -- "$cur") )
        else
            COMPREPLY=( $(compgen -W "${cmdList}" -- "$cur") )
        fi
        return 0
    fi

    # Complete flags for the matched command
    if [[ "$cur" == -* ]]; then
        case "$cmd" in
${cases.join("\n            ;;\n")}
            ;;
            *)
                COMPREPLY=( $(compgen -W "${globalList}" -- "$cur") )
                ;;
        esac
    fi

    return 0
}

complete -F _browse_completions browse
`;
}

export function generateZshCompletions(): string {
	const cmdDescriptions: string[] = [];
	for (const cmd of COMMANDS) {
		// Escape colons in command names for zsh
		const escaped = cmd.replace(/:/g, "\\:");
		cmdDescriptions.push(`        '${escaped}'`);
	}

	const flagCases: string[] = [];
	for (const cmd of COMMANDS) {
		const flags = [...(KNOWN_FLAGS[cmd] ?? []), ...GLOBAL_FLAGS];
		if (flags.length > 0) {
			const flagArgs = flags.map((f) => `'${f}'`).join(" ");
			flagCases.push(`        ${cmd})\n            _arguments ${flagArgs} && return 0\n            ;;`);
		}
	}

	const cmdList = COMMANDS.map((c) => `'${c}'`).join(" ");

	return `#compdef browse
# zsh completion for browse
# Add to ~/.zshrc: eval "$(browse completions zsh)"

_browse() {
    local -a commands
    commands=(
${cmdDescriptions.join("\n")}
    )

    local cmd=""
    local i
    for ((i=2; i < CURRENT; i++)); do
        case "\${words[i]}" in
            --timeout|--session|--config)
                ((i++))
                ;;
            --json)
                ;;
            -*)
                ;;
            *)
                cmd="\${words[i]}"
                break
                ;;
        esac
    done

    if [[ -z "$cmd" ]]; then
        if [[ "\${words[CURRENT]}" == -* ]]; then
            compadd -- ${GLOBAL_FLAGS.join(" ")}
        else
            compadd -- ${COMMANDS.join(" ")}
        fi
        return 0
    fi

    # Complete flags for the command
    case "$cmd" in
${flagCases.join("\n")}
        *)
            compadd -- ${GLOBAL_FLAGS.join(" ")}
            ;;
    esac
}

_browse "$@"
`;
}

export function generateFishCompletions(): string {
	const lines: string[] = [
		"# fish completion for browse",
		'# Add to fish config: browse completions fish | source',
		"",
		"# Disable file completions by default",
		"complete -c browse -f",
		"",
		"# Helper: returns true when no subcommand has been given yet",
		"function __browse_no_subcommand",
		`    set -l cmds ${COMMANDS.join(" ")}`,
		"    set -l tokens (commandline -opc)",
		"    for t in $tokens[2..]",
		"        if contains -- $t $cmds",
		"            return 1",
		"        end",
		"    end",
		"    return 0",
		"end",
		"",
	];

	// Command completions (only when no subcommand yet)
	for (const cmd of COMMANDS) {
		lines.push(
			`complete -c browse -n __browse_no_subcommand -a '${cmd}'`,
		);
	}

	lines.push("");

	// Global flags (available everywhere)
	for (const flag of GLOBAL_FLAGS) {
		const name = flag.replace(/^--/, "");
		lines.push(`complete -c browse -l '${name}'`);
	}

	lines.push("");

	// Per-command flags
	for (const cmd of COMMANDS) {
		const flags = KNOWN_FLAGS[cmd] ?? [];
		for (const flag of flags) {
			// Skip flags already covered by globals
			if (GLOBAL_FLAGS.includes(flag)) continue;
			if (flag.startsWith("--")) {
				const name = flag.replace(/^--/, "");
				lines.push(
					`complete -c browse -n '__fish_seen_subcommand_from ${cmd}' -l '${name}'`,
				);
			} else if (flag.startsWith("-")) {
				const name = flag.replace(/^-/, "");
				lines.push(
					`complete -c browse -n '__fish_seen_subcommand_from ${cmd}' -s '${name}'`,
				);
			}
		}
	}

	lines.push("");
	return lines.join("\n");
}

export function generateCompletions(shell: string): string | null {
	switch (shell) {
		case "bash":
			return generateBashCompletions();
		case "zsh":
			return generateZshCompletions();
		case "fish":
			return generateFishCompletions();
		default:
			return null;
	}
}
