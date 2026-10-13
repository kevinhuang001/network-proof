/** Validate user-supplied RPC endpoints before persisting them. */
export function rpcUrlError(input: string): string | null {
  const value = input.trim();
  if (!value) return '请填写 RPC 节点地址';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '只支持 HTTP 或 HTTPS 节点';
    if (!url.hostname) return '节点必须有主机名';
    if (url.username || url.password) return '请勿在节点地址中嵌入用户名或密码';
    if (url.hash) return '节点地址不能包含片段标识符';
    return null;
  } catch {
    return '节点地址不是有效的 URL';
  }
}
