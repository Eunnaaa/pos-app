/**
 * CSV / Excel Export Utility
 * Mengonversi dataset array of objects ke format CSV dengan UTF-8 BOM
 * sehingga langsung terbaca rapi di Microsoft Excel, Google Sheets, dan Numbers.
 */

export interface CsvColumn<T> {
  header: string;
  accessor: (item: T) => string | number | boolean | null | undefined;
}

export function exportToCsv<T>(
  filename: string,
  data: T[],
  columns: CsvColumn<T>[]
): void {
  if (typeof window === "undefined") return;

  const headerRow = columns.map((col) => `"${col.header.replace(/"/g, '""')}"`).join(",");
  const dataRows = data.map((item) =>
    columns
      .map((col) => {
        const val = col.accessor(item);
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      })
      .join(",")
  );

  // UTF-8 BOM (\uFEFF) ensures Excel renders Indonesian characters / accents correctly
  const csvContent = "\uFEFF" + [headerRow, ...dataRows].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.setAttribute("href", url);
  const cleanFilename = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  link.setAttribute("download", cleanFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
