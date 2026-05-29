/** Exact header row required by bulk CSV import (apps/dashboard/src/app/jobs/page.tsx). */
export const DISCOVERY_SOURCES_CSV_HEADERS = 'sourceKind,label,sourceKey,enabled' as const;

/** Filename the job bot must attach so the user can import directly. */
export const DISCOVERY_SOURCES_CSV_FILENAME = 'discovery-sources-import.csv';

/**
 * Copy-paste prompt for ChatGPT, Claude, Perplexity, or any job bot that researches the web.
 * Requires a downloadable .csv attachment — NOT CSV text in the chat.
 */
export const DISCOVERY_SOURCES_CSV_AI_PROMPT = `You are a job-search research assistant with access to the live web. Do thorough, deep research to find real companies and their public job boards that match my criteria below.

BOARD TYPE — NON-NEGOTIABLE:
Only include companies whose applications run on Greenhouse or Lever. Skip Workday, iCIMS, SmartRecruiters, company-hosted ATS pages, and any other non–Greenhouse/non–Lever board — even if they match my criteria otherwise.

DELIVERABLE — NON-NEGOTIABLE:
You MUST give me a DOWNLOADABLE .csv FILE I can save and upload. The file must be attached / offered for download in your UI.

FORBIDDEN (do not do these):
- Do NOT paste CSV rows as plain text in the chat.
- Do NOT put the data in a markdown code block.
- Do NOT reply with only a table or list — I need a real file.
- Do NOT tell me to copy from the chat — I will import an uploaded .csv file.

HOW TO PRODUCE THE FILE:
1. After researching, build the dataset in code (Python recommended).
2. Write UTF-8 CSV to a file named exactly: ${DISCOVERY_SOURCES_CSV_FILENAME}
3. Row 1 of the file MUST be this header, copied exactly (spelling, order, lowercase):
${DISCOVERY_SOURCES_CSV_HEADERS}
4. Use the csv module (or equivalent) so commas inside fields are quoted correctly.
5. Attach or publish that file for download (ChatGPT: Advanced Data Analysis / Python / Code Interpreter; Claude: file or artifact export; other bots: native file export).
6. Your chat message should be at most 2 short sentences confirming the file is ready to download — no CSV body in the message.

Example Python pattern you should run:
import csv
rows = [
  ["greenhouse", "Stripe", "stripe", "true"],
  # ... one list per company after web research ...
]
with open("${DISCOVERY_SOURCES_CSV_FILENAME}", "w", newline="", encoding="utf-8") as f:
  w = csv.writer(f)
  w.writerow(["sourceKind", "label", "sourceKey", "enabled"])
  w.writerows(rows)

COLUMN RULES (required — import rejects anything else):
1. sourceKind — exactly one of: greenhouse | lever
   - greenhouse → Greenhouse apply site (boards.greenhouse.io / job-boards.greenhouse.io)
   - lever → Lever apply site (jobs.lever.co)
2. label — short display name (e.g. Stripe, Wealthsimple)
3. sourceKey — verified board id or URL:
   - greenhouse: token or https://boards.greenhouse.io/COMPANY
   - lever: handle or https://jobs.lever.co/COMPANY
4. enabled — true or false (use true for rows to import)

DATA QUALITY:
- Real companies only; verify each board on the web and that it is Greenhouse or Lever before adding a row.
- At least 20 data rows when possible (plus the header), all greenhouse or lever.
- If you truly cannot attach a file on this platform, say so once, then provide the file via your file tool — still do not dump CSV in chat unless there is zero file capability.

MY SEARCH CRITERIA (edit before sending):
[Describe role, location, industry, company size, and how many companies you want — e.g. "25 Canadian fintech companies hiring software engineers"]

Final check before you finish: Can I click Download on ${DISCOVERY_SOURCES_CSV_FILENAME}? If not, fix your approach until I can.`;

export const DISCOVERY_SOURCES_CSV_TEMPLATE_HELP = `Starter with header ${DISCOVERY_SOURCES_CSV_HEADERS}. Use if you already have a .csv file from your job bot; otherwise use Copy prompt to get ${DISCOVERY_SOURCES_CSV_FILENAME} as a download.`;

export const DISCOVERY_SOURCES_CSV_BULK_IMPORT_HELP = `Import many boards at once. Copy the prompt into a job bot with web research + file export. You need a downloaded .csv (e.g. ${DISCOVERY_SOURCES_CSV_FILENAME}), not CSV pasted in chat. Upload it here.`;

export const DISCOVERY_SOURCES_CSV_AI_PROMPT_HELP = [
  `Copy into ChatGPT (enable Python/ADA), Claude, or any bot that can attach files.`,
  `Prompt limits results to Greenhouse and Lever apply sites only.`,
  `Edit search criteria, send — bot must deliver downloadable ${DISCOVERY_SOURCES_CSV_FILENAME}.`,
  `Do not use replies that only show CSV text in chat; download the file, then Import CSV.`,
].join(' ');
