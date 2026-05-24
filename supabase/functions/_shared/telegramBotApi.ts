const TG_API = "https://api.telegram.org";

export type CreateChatInviteLinkResult = {
  ok: boolean;
  invite_link?: string;
  description?: string;
};

/** Одноразовая ссылка в канал/супергруппу (member_limit=1). Бот — админ с правом invite. */
export async function createOneTimeChatInviteLink(
  token: string,
  chatId: string,
  opts?: { name?: string; expireDateUnix?: number },
): Promise<CreateChatInviteLinkResult> {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    member_limit: 1,
    creates_join_request: false,
  };
  const name = opts?.name?.trim();
  if (name) payload.name = name.slice(0, 32);
  if (opts?.expireDateUnix && opts.expireDateUnix > 0) {
    payload.expire_date = opts.expireDateUnix;
  }

  const res = await fetch(`${TG_API}/bot${token}/createChatInviteLink`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  let data: { ok?: boolean; result?: { invite_link?: string }; description?: string } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    return { ok: false, description: "Invalid Telegram API response" };
  }

  if (!data.ok || !data.result?.invite_link) {
    return { ok: false, description: data.description ?? `HTTP ${res.status}` };
  }

  return { ok: true, invite_link: data.result.invite_link };
}
