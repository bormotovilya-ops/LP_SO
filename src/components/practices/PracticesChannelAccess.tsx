import { useCallback, useEffect, useState } from "react";
import { functionsApiUrl, supabaseFunctionsInvokeHeaders } from "@/lib/functionsApi";
import {
  getPracticesDirectClientToken,
  getPracticesPaidOrderId,
} from "@/lib/practicesPurchase";

const DEFAULT_CHANNEL_POST_URL = "https://t.me/c/3454870164/40";
const POLL_MS = 3000;
const MAX_POLL_ATTEMPTS = 40;

type InviteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "waiting_payment" }
  | { status: "ready"; inviteLink: string }
  | { status: "error"; message: string };

function channelPostUrl(): string {
  const fromEnv = import.meta.env.VITE_PRACTICES_CHANNEL_POST_URL?.trim();
  return fromEnv || DEFAULT_CHANNEL_POST_URL;
}

async function fetchChannelInvite(payload: {
  orderId?: string;
  tochkaCheckoutReturn?: boolean;
  clientToken?: string;
}): Promise<{
  ok: boolean;
  pending?: boolean;
  inviteLink?: string;
  error?: string;
}> {
  const res = await fetch(functionsApiUrl("/practices-channel-invite"), {
    method: "POST",
    headers: {
      ...supabaseFunctionsInvokeHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  let data: { ok?: boolean; pending?: boolean; inviteLink?: string; error?: string } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    return { ok: false, error: "Некорректный ответ сервера" };
  }
  if (res.status === 402 || data.pending) {
    return { ok: false, pending: true };
  }
  if (!res.ok || !data.ok || !data.inviteLink) {
    return { ok: false, error: data.error?.trim() || "Не удалось получить ссылку в канал" };
  }
  return { ok: true, inviteLink: data.inviteLink };
}

async function checkPaid(orderId: string): Promise<boolean> {
  const res = await fetch(functionsApiUrl("/practices-paid-check"), {
    method: "POST",
    headers: {
      ...supabaseFunctionsInvokeHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ orderId }),
  });
  try {
    const data = (await res.json()) as { paid?: boolean };
    return Boolean(data.paid);
  } catch {
    return false;
  }
}

type PracticesChannelAccessProps = {
  refreshKey?: number;
};

export function PracticesChannelAccess({ refreshKey = 0 }: PracticesChannelAccessProps) {
  const [state, setState] = useState<InviteState>({ status: "idle" });

  const loadInvite = useCallback(async () => {
    const orderId = getPracticesPaidOrderId();
    const clientToken = getPracticesDirectClientToken();
    const payload = orderId
      ? { orderId }
      : clientToken
        ? { tochkaCheckoutReturn: true, clientToken }
        : null;

    if (!payload) {
      setState({
        status: "error",
        message: "Сначала оплатите сборник на этой странице — затем откроется доступ в канал.",
      });
      return;
    }

    setState({ status: "loading" });

    let result = await fetchChannelInvite(payload);
    if (result.ok && result.inviteLink) {
      setState({ status: "ready", inviteLink: result.inviteLink });
      return;
    }

    if (result.pending && orderId) {
      setState({ status: "waiting_payment" });
      for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const paid = await checkPaid(orderId);
        if (!paid) continue;
        result = await fetchChannelInvite({ orderId });
        if (result.ok && result.inviteLink) {
          setState({ status: "ready", inviteLink: result.inviteLink });
          return;
        }
        if (!result.pending) break;
      }
      setState({
        status: "error",
        message:
          "Оплата ещё не подтверждена. Подождите пару минут и обновите страницу. Если списание прошло — напишите в поддержку.",
      });
      return;
    }

    setState({ status: "error", message: result.error ?? "Не удалось получить ссылку" });
  }, []);

  useEffect(() => {
    void loadInvite();
  }, [loadInvite, refreshKey]);

  const postUrl = channelPostUrl();

  if (state.status === "idle" || state.status === "loading" || state.status === "waiting_payment") {
    const label =
      state.status === "waiting_payment"
        ? "Подтверждаем оплату…"
        : "Готовим персональную ссылку в канал…";
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium leading-relaxed text-accent">{label}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Ссылка одноразовая: откроет доступ в закрытый Telegram-канал со сборником.
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-destructive">{state.message}</p>
        <button
          type="button"
          onClick={() => void loadInvite()}
          className="inline-flex w-fit items-center justify-center border border-foreground/25 px-5 py-3 text-xs uppercase tracking-[0.22em] text-foreground transition-colors hover:border-accent hover:text-accent"
        >
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-4">
      <p className="text-sm font-medium leading-relaxed text-accent">
        Спасибо за оплату. Перейдите в канал — там весь сборник. Ссылка ниже действует один раз.
      </p>
      <a
        href={state.inviteLink}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center gap-2 border border-accent bg-accent px-6 py-3 text-xs uppercase tracking-[0.22em] text-accent-foreground transition-colors hover:bg-accent/90"
      >
        Войти в канал со сборником
      </a>
      <p className="text-xs leading-relaxed text-muted-foreground">
        После вступления откройте{" "}
        <a href={postUrl} target="_blank" rel="noopener noreferrer" className="text-accent underline-offset-2 hover:underline">
          первое сообщение в канале
        </a>
        , если Telegram не покажет ленту сразу.
      </p>
    </div>
  );
}
