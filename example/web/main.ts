import { ConvexClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import type { AnswerResult, SearchResult } from "../../src/client/index";
import "./style.css";

type Delivery = { key: string; title: string; status: string; revision: number; lastSyncedAt?: number };
const search = makeFunctionReference<"action", { query: string }, SearchResult[]>("webDemo:search");
const ask = makeFunctionReference<"action", { query: string }, AnswerResult>("webDemo:ask");
const status = makeFunctionReference<"query", Record<string, never>, Delivery[]>("webDemo:status");
const form = document.querySelector<HTMLFormElement>("#search-form")!;
const input = document.querySelector<HTMLTextAreaElement>("#query")!;
const results = document.querySelector<HTMLElement>("#results")!;
const title = document.querySelector<HTMLElement>("#results-title")!;
const announcement = document.querySelector<HTMLElement>("#announcement")!;
const content = document.querySelector<HTMLElement>("#result-content")!;
const meta = document.querySelector<HTMLElement>("#result-meta")!;
const stateList = document.querySelector<HTMLUListElement>("#sync-state")!;
const buttons = [...document.querySelectorAll<HTMLButtonElement>("button")];
let busy = false;
let client: ConvexClient | undefined;

function announce(message: string, error = false) {
  announcement.textContent = message;
  announcement.classList.toggle("error", error);
  announcement.setAttribute("role", error ? "alert" : "status");
}

function setBusy(value: boolean) {
  busy = value;
  results.setAttribute("aria-busy", String(value));
  for (const button of buttons) button.disabled = value || !client;
}

function renderSources(sources: SearchResult[]) {
  if (!sources.length) return;
  const list = document.createElement("ol");
  list.className = "source-list";
  sources.forEach((source, index) => {
    const item = document.createElement("li");
    item.className = "source";
    const heading = document.createElement("h3");
    heading.textContent = `${index + 1}. ${source.question}`;
    if (source.url) {
      try {
        const url = new URL(source.url);
        if (url.protocol === "https:" || url.protocol === "http:") {
          const link = document.createElement("a");
          link.href = url.href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = heading.textContent;
          link.setAttribute("aria-label", `${source.question} (opens in a new tab)`);
          heading.replaceChildren(link);
        }
      } catch { /* Invalid source URLs remain readable text. */ }
    }
    const excerpt = document.createElement("p");
    excerpt.textContent = source.answer;
    item.append(heading, excerpt);
    list.append(item);
  });
  content.append(list);
}

async function submit(mode: "search" | "ask") {
  if (!client || busy || !form.reportValidity()) return;
  const query = input.value.trim();
  if (query.length < 2) {
    announce("Enter at least two characters, then try again.", true);
    input.focus();
    return;
  }
  setBusy(true);
  title.textContent = mode === "ask" ? "AI answer" : "Matching documents";
  content.replaceChildren();
  meta.textContent = "";
  announce(mode === "ask" ? "Generating an answer from the public guides…" : "Searching the public guides…");
  const start = performance.now();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    deadline = setTimeout(() => reject(new Error("Demo request timed out")), 45_000);
  });
  try {
    if (mode === "search") {
      const sources = await Promise.race([client.action(search, { query }), timeout]);
      announce(sources.length ? `Results for “${query}”` : `No documents matched “${query}”. Try a question about synchronization or integration keys.`);
      renderSources(sources);
    } else {
      const answer = await Promise.race([client.action(ask, { query }), timeout]);
      if (answer.kind === "answer") {
        announce(`Answer for “${query}”`);
        const body = document.createElement("p");
        body.className = "answer";
        body.textContent = answer.answer;
        content.append(body);
      } else {
        announce(answer.kind === "abstain"
          ? "The public guides do not support an answer to this question. Try one of the example questions."
          : "AI answers are temporarily unavailable. You can still search the documents.");
      }
      renderSources(answer.sources);
    }
    meta.textContent = `${((performance.now() - start) / 1000).toFixed(1)} s`;
  } catch (error) {
    const limited = error instanceof Error && /Too many requests|demo request limit|HTTP 429/i.test(error.message);
    announce(limited
      ? "The shared demo has reached its request limit. Try again later or run the example with your own development project."
      : "The demo could not complete this request. Check your connection and try again.", true);
  } finally {
    clearTimeout(deadline);
    setBusy(false);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const button = (event as SubmitEvent).submitter as HTMLButtonElement | null;
  void submit(button?.value === "ask" ? "ask" : "search");
});
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    void submit(event.metaKey || event.ctrlKey ? "ask" : "search");
  }
});
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-query]")) {
  button.addEventListener("click", () => {
    input.value = button.dataset.query!;
    void submit("ask");
  });
}

const backend = import.meta.env.VITE_CONVEX_URL as string | undefined;
if (!backend) {
  announce("This demo needs a backend URL. Set VITE_CONVEX_URL as described in the example guide.", true);
  stateList.replaceChildren(Object.assign(document.createElement("li"), { textContent: "Backend not configured" }));
} else {
  try {
    client = new ConvexClient(backend);
    setBusy(false);
    announce("Choose Search documents or Ask AI to run your question.");
    const unsubscribe = client.onUpdate(status, {}, (deliveries) => {
      stateList.replaceChildren();
      for (const delivery of deliveries) {
        const item = document.createElement("li");
        const name = document.createElement("span");
        name.className = "sync-title";
        name.textContent = delivery.title;
        const detail = document.createElement("div");
        detail.className = "sync-detail";
        detail.dataset.state = delivery.status;
        const state = document.createElement("span");
        state.textContent = delivery.status === "not_synced" ? "Not synchronized" : delivery.status.charAt(0).toUpperCase() + delivery.status.slice(1);
        const revision = document.createElement("span");
        revision.textContent = `Revision ${delivery.revision}`;
        detail.append(state, revision);
        item.append(name, detail);
        stateList.append(item);
      }
    }, () => {
      stateList.replaceChildren(Object.assign(document.createElement("li"), { textContent: "Delivery state unavailable. Try reloading the demo." }));
    });
    window.addEventListener("pagehide", (event) => {
      if (!event.persisted) { unsubscribe(); void client?.close(); }
    });
  } catch {
    client = undefined;
    setBusy(false);
    announce("The demo backend could not connect. Check the example configuration and reload.", true);
  }
}
