import type { ItemTypeValue } from "../services/item-input";

// Exact headers and values of the private catalog export. These are source
// data, so they stay in their original Hebrew.
export const catalog = {
	id: "מזהה",
	originalName: "שם מקורי",
	type: "סוג",
	reviewedDescription: "תיאור בדוק",
	driveId: "מזהה Drive",
	mime: "MIME",
	size: "גודל בבתים",
	sha256: "SHA256",
	rights: "זכויות",
	sourceKind: "סוג מקור",
} as const;

export const web = {
	id: "מזהה בקטלוג",
	type: "סוג מקור",
	title: "כותרת",
	publisher: "מפרסם",
	author: "יוצר או כתב",
	publishedText: "תאריך פרסום לפי מקור",
	url: "כתובת מקור",
	identityBasis: "בסיס קישור לאב",
	saved: "שמירה בפועל",
	licenseSource: "מקור רישיון",
} as const;

export const internetSourceKind = "אינטרנט";
export const explicitIdentityPrefix = "שם מפורש";
export const needsClarificationPrefix = "נדרש בירור";

export const catalogTypes: Record<string, ItemTypeValue> = {
	"קובץ תמונה": "picture",
	PDF: "document",
	מסמך: "document",
	מצגת: "document",
	גיליון: "document",
	"קובץ אחר": "other",
	"קובץ מערכת": "other",
	סרטון: "video",
	הקלטה: "audio",
};

export const webTypes: Record<string, ItemTypeValue> = {
	"דף אינטרנט": "other",
	"סרטון (קישור)": "video",
	"מסמך PDF": "document",
	"הסכת (קישור)": "audio",
	"הקלטה (קישור)": "audio",
	כתבה: "article",
	ראיון: "interview",
	איור: "drawing",
	"קובץ תמונה": "picture",
};

// Labels shown to the family, in display order, read verbatim from the row.
export const familyVisibleColumns = [
	"תיקייה",
	"תורם",
	"יוצר או צלם",
	"זכויות",
	"מצב זיהוי",
	"אבא מופיע",
	"מאשר הופעה",
	"טווח הופעה",
	"בחירה לאתר",
	"הערות יורם",
	"תיאור בדוק",
	"מצב בדיקה",
	"כיסוי בדיקה",
	"קבוצת כפילות",
	"תאריך אירוע",
	"דיוק תאריך",
	"ראיה לתאריך",
] as const;
