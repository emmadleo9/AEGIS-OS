import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { type ChatSlice, createChatSlice } from "./chatSlice";
import { type UISlice, createUISlice } from "./uiSlice";
import { loadTranslations } from "@/i18n/translations";

export type AppState = {
  chat: ChatSlice;
  ui: UISlice;
};

const useBoundStore = create<AppState>()(
  persist(
    (set, get, api) => ({
      chat: createChatSlice(set, get, api) as ChatSlice,
      ui: createUISlice(set, get, api) as UISlice,
    }),
    {
      name: "app-state",
      storage: createJSONStorage(() => localStorage, {
        reviver: (_key, value: unknown) => {
          // Just in case we decide to store maps (see the replacer below)
          const wrapped = value as {
            type?: string;
            value?: [string, unknown][];
          } | null;
          if (wrapped?.type === "map") {
            return new Map(wrapped.value);
          }
          return value;
        },
        replacer: (_key, value) => {
          // Just in case we decide to store maps
          if (value instanceof Map) {
            return { type: "map", value: Array.from(value.entries()) };
          }
          return value;
        },
      }),
      // Restore the state after hydration
      onRehydrateStorage: (prev) => (state) => {
        if (state) {
          state.ui = {
            ...createUISlice,
            ...prev.ui,
            ...state.ui,
          };
          if (state.ui.language && state.ui.language !== "es") {
            loadTranslations(state.ui.language).catch(console.error);
          }
        }
      },
      // Pick the keys to be persisted
      partialize: (state) => ({
        ui: {
          searchPattern: state.ui.searchPattern,
          filter: state.ui.filter,
          activeOrgId: state.ui.activeOrgId,
          language: state.ui.language,
        },
      }),
    },
  ),
);

export default useBoundStore;

// TODO: for real
export function reset() {
  useBoundStore.setState((state) => {
    return {
      ui: {
        ...state.ui,
        activeOrgId: null,
        activeConvId: null,
        initialized: false,
      },
      chat: {
        ...state.chat,
        organizations: new Map(),
        conversations: new Map(),
        messages: new Map(),
      },
    };
  });
}
