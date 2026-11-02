// Connecting Claude to a game (the server's /mcp, see mcp-http.ts there):
// the account page makes a key and shows the command to paste.

/** The Claude Code command that adds this server, signed with `key`. */
export function mcpCommand(origin: string, key: string): string {
  return `claude mcp add --transport http vtt ${origin}/mcp --header "Authorization: Bearer ${key}"`;
}
