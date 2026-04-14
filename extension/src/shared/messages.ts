import type { PageRecord, SettingsRecord, SummaryStatus } from "./types";

export type MsgGetPageStatus = {
  type: "GET_PAGE_STATUS";
  url: string;
  /** When set, SharePoint pages can match an existing row by title if the URL differs. */
  title?: string;
};

/** Add current tab’s hostname to the allowlist and record this visit immediately. */
export type MsgAddDomainAndLog = {
  type: "ADD_DOMAIN_AND_LOG";
  tabId: number;
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
  | MsgAddDomainAndLog
  | MsgRequestSummary
  | MsgGetSettings
  | MsgSaveSettings
  | MsgExportJson;
