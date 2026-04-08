import type { PageRecord, SettingsRecord, SummaryStatus } from "./types";

export type MsgGetPageStatus = {
  type: "GET_PAGE_STATUS";
  url: string;
};

export type MsgPageStatusReply = {
  allowed: boolean;
  canonical_url: string;
  page: PageRecord | null;
};

export type MsgRequestSummary = {
  type: "REQUEST_SUMMARY";
  /** Tab id to extract from */
  tabId: number;
  refresh: boolean;
};

export type MsgSummaryResult = {
  ok: boolean;
  error?: string;
};

export type MsgGetSettings = { type: "GET_SETTINGS" };
export type MsgSaveSettings = { type: "SAVE_SETTINGS"; settings: SettingsRecord };

export type MsgExportJson = { type: "EXPORT_JSON" };

export type MsgContentExtracted = {
  type: "CONTENT_EXTRACTED";
  text: string;
  title: string;
  url: string;
};

export type BackgroundMessage =
  | MsgGetPageStatus
  | MsgRequestSummary
  | MsgGetSettings
  | MsgSaveSettings
  | MsgExportJson;
