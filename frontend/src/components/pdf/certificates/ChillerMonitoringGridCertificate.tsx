import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { format, parseISO, startOfDay } from 'date-fns';
import { PDFHeader } from '../PDFHeader';
import {
  buildChillerMonitoringGrid,
  chunkColumnIndices,
  CHILLER_GRID_MAX_COLS_PER_PAGE,
  type ChillerGridFlatRow,
  type ChillerMonitoringMappedLog,
} from '@/lib/chiller-monitoring-grid';

/** Matches MonitoringPDFData in pdf-generator (avoid circular import). */
type ChillerGridPdfData = {
  logs: ChillerMonitoringMappedLog[];
  approvedBy?: string;
  printedBy?: string;
  reportDate?: string;
};

const styles = StyleSheet.create({
  page: {
    padding: 20,
    fontSize: 7,
    fontFamily: 'Helvetica',
  },
  title: {
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  meta: {
    fontSize: 8,
    textAlign: 'center',
    marginBottom: 6,
    color: '#111',
  },
  pageNote: {
    fontSize: 7,
    textAlign: 'right',
    marginBottom: 4,
    color: '#666',
  },
  logbookFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 4,
    borderTop: '1 solid #000',
    fontSize: 7,
  },
  statusFooterRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginTop: 2,
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderLeft: '1 solid #000',
    borderRight: '1 solid #000',
    borderBottom: '1 solid #000',
    fontSize: 5.6,
  },
  statusFooterItem: {
    width: '25%',
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderRight: '1 solid #000',
    whiteSpace: 'nowrap',
    textAlign: 'left',
  },
  statusFooterItemLast: {
    borderRight: 'none',
  },
  table: {
    width: '100%',
    border: '1 solid #000',
    position: 'relative',
  },
  /** Continuous divider between DESCRIPTION and data columns (9% + 28% = 37%). */
  tableDescriptionDivider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '37%',
    borderLeft: '1 solid #000',
    width: 0,
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottom: '1 solid #000',
  },
  bodyRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #000',
    minHeight: 20,
    alignItems: 'center',
  },
  cellSectionVerticalWrap: {
    width: '9%',
    borderRight: '1 solid #000',
    paddingVertical: 3,
    paddingHorizontal: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verticalSectionChars: {
    fontSize: 6,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 1.05,
  },
  cellSectionEmpty: {
    width: '9%',
    borderRight: '1 solid #000',
    padding: 2,
    justifyContent: 'center',
  },
  cellDescription: {
    width: '28%',
    paddingVertical: 3,
    paddingHorizontal: 3,
    fontSize: 6.2,
    textAlign: 'left',
    lineHeight: 1.25,
    alignSelf: 'stretch',
  },
  cellData: {
    paddingVertical: 3,
    paddingHorizontal: 3,
    fontSize: 6.2,
    textAlign: 'center',
    lineHeight: 1.25,
    alignSelf: 'stretch',
  },
  cellDataLast: {
    borderRight: 'none',
  },
  redText: {
    color: '#cc0000',
  },
  footer: {
    marginTop: 8,
    fontSize: 8,
  },
  /** One logical section (e.g. all 5 Evaporator rows): single merged-style label column */
  sectionGroupRow: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'stretch',
    borderBottom: 'none',
  },
  sectionGroupLabelCell: {
    width: '9%',
    borderRight: '1 solid #000',
    borderBottom: '1 solid #000',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingVertical: 4,
    paddingHorizontal: 1,
  },
  sectionGroupBody: {
    width: '91%',
    flexDirection: 'column',
  },
  sectionGroupDataRow: {
    flexDirection: 'row',
    width: '100%',
    borderBottom: '1 solid #000',
    minHeight: 20,
    alignItems: 'stretch',
  },
  sectionGroupDataRowLast: {
    flexDirection: 'row',
    width: '100%',
    borderBottom: '1 solid #000',
    minHeight: 20,
    alignItems: 'stretch',
  },
  cellDescriptionInner: {
    width: '30.769%',
    paddingVertical: 3,
    paddingHorizontal: 3,
    fontSize: 6.2,
    textAlign: 'left',
    lineHeight: 1.25,
    alignSelf: 'stretch',
  },
  descCellBox: {
    width: '28%',
    paddingVertical: 3,
    paddingHorizontal: 3,
    alignSelf: 'stretch',
    justifyContent: 'center',
    flexGrow: 0,
    flexShrink: 0,
  },
  descInnerCellBox: {
    width: '30.769%',
    paddingVertical: 3,
    paddingHorizontal: 3,
    alignSelf: 'stretch',
    justifyContent: 'center',
    flexGrow: 0,
    flexShrink: 0,
  },
  colSeparator: {
    width: 0.8,
    borderLeft: '1 solid #000',
    alignSelf: 'stretch',
  },
  dataCellBox: {
    borderRight: '1 solid #000',
    paddingVertical: 3,
    paddingHorizontal: 0,
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexGrow: 0,
    flexShrink: 0,
  },
  dataCellContent: {
    flexGrow: 1,
    flexBasis: 0,
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dataCellBoxFirst: {
    borderLeft: 'none',
  },
  dataCellBoxLast: {
    borderRight: 'none',
  },
  descText: {
    fontSize: 6.2,
    textAlign: 'left',
    lineHeight: 1.25,
  },
  dataText: {
    fontSize: 6.2,
    textAlign: 'center',
    lineHeight: 1.25,
  },
});

interface Props {
  data: ChillerGridPdfData;
}

function resolveReportDate(logs: ChillerMonitoringMappedLog[], iso?: string): Date {
  if (iso) {
    try {
      return startOfDay(parseISO(iso));
    } catch {
      // fall through
    }
  }
  if (logs.length > 0 && logs[0].timestamp) {
    return startOfDay(logs[0].timestamp);
  }
  return startOfDay(new Date());
}

function verticalSectionLabelChars(title: string): string {
  const t = title.trim();
  if (!t) return '';
  return t.split('').join('\n');
}

function pctForDataColumns(count: number): string {
  const c = Math.max(count, 1);
  return `${(63 / c).toFixed(3)}%`;
}

/** Widths inside the 91% right-hand block: 28% + 63% of full table → 28/91 and 63/91 of inner. */
function pctInnerDataCol(timeColCount: number): string {
  const c = Math.max(timeColCount, 1);
  return `${((63 / 91 / c) * 100).toFixed(3)}%`;
}

function groupCoreRowsBySection(
  rows: ChillerGridFlatRow[],
): { sectionTitle: string; rows: ChillerGridFlatRow[] }[] {
  const groups: { sectionTitle: string; rows: ChillerGridFlatRow[] }[] = [];
  let curTitle = '';
  let curRows: ChillerGridFlatRow[] = [];
  for (const row of rows) {
    if (row.sectionLabel) {
      if (curRows.length > 0) {
        groups.push({ sectionTitle: curTitle, rows: curRows });
      }
      curTitle = row.sectionLabel;
      curRows = [row];
    } else {
      curRows.push(row);
    }
  }
  if (curRows.length > 0) {
    groups.push({ sectionTitle: curTitle, rows: curRows });
  }
  return groups;
}

function pctForProductColumns(count: number): string {
  const c = Math.max(count, 1);
  return `${(63 / c).toFixed(3)}%`;
}

type DisplaySlot = {
  key: string;
  ci: number | null;
  label: string;
};

function makeDisplaySlots(columns: { id: string; label: string }[], indices: number[]): DisplaySlot[] {
  return indices.map((ci) => ({
    key: columns[ci].id,
    ci,
    label: columns[ci].label,
  }));
}

function rowCellsForSlots(
  row: ChillerGridFlatRow,
  slots: DisplaySlot[],
): { key: string; text: string; red: boolean }[] {
  return slots.map((slot) => {
    const ci = slot.ci;
    const v = ci == null ? null : row.values[ci];
    const isEmpty = v === null || v === undefined || v === '';
    return {
      key: slot.key,
      // Structural placeholder: keep the cell, but render empty content.
      text: isEmpty ? '' : String(v),
      red: ci == null ? false : row.flags[ci],
    };
  });
}

export function ChillerMonitoringGridCertificate({ data }: Props) {
  const logs = (data.logs || []) as ChillerMonitoringMappedLog[];
  const equipmentId = logs[0]?.equipmentId ?? '—';
  const reportDate = resolveReportDate(logs, data.reportDate);
  const grid = buildChillerMonitoringGrid(logs, { equipmentId, reportDate });

  const approvedBy = (data.approvedBy || '').toString().trim() || '—';
  const printedBy = (data.printedBy || '').toString().trim() || '—';

  const n = grid.columns.length;
  const chunks = chunkColumnIndices(n, CHILLER_GRID_MAX_COLS_PER_PAGE);
  const remarksText = grid.columns.length
    ? grid.columns
        .map((col) => {
          const r = (col.log.remarks || '').toString().trim();
          return `${col.label}: ${r || '—'}`;
        })
        .join(' | ')
    : '—';

  const verifiedSummary =
    grid.finalSignoffRows[0]?.values
      .map((v) => (v === null || v === undefined || v === '' ? '' : String(v)))
      .filter(Boolean)
      .join(' · ') || '—';

  const statusFooterItems = grid.statusRows.map((row) => {
    let latest = '—';
    for (let i = row.values.length - 1; i >= 0; i -= 1) {
      const v = row.values[i];
      if (v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '—') {
        latest = String(v).trim();
        break;
      }
    }
    return { label: row.description, value: latest };
  });

  const renderSectionCell = (sectionLabel: string) => {
    const vert = verticalSectionLabelChars(sectionLabel);
    if (!vert) {
      return (
        <View style={styles.cellSectionEmpty}>
          <Text style={{ fontSize: 6 }}> </Text>
        </View>
      );
    }
    return (
      <View style={styles.cellSectionVerticalWrap}>
        <Text style={styles.verticalSectionChars}>{vert}</Text>
      </View>
    );
  };

  const renderCoreSectionGroups = (slots: DisplaySlot[]) => {
    const dataW = pctInnerDataCol(slots.length);
    const coreGroups = groupCoreRowsBySection(grid.coreFlatRows);
    return coreGroups.map((g, gi) => (
      <View
        key={`sec-grp-${g.sectionTitle}-${gi}`}
        style={styles.sectionGroupRow}
        wrap={false}
      >
        <View style={styles.sectionGroupLabelCell}>
          <Text style={styles.verticalSectionChars}>
            {verticalSectionLabelChars(g.sectionTitle.toUpperCase())}
          </Text>
        </View>
        <View style={styles.sectionGroupBody}>
          {g.rows.map((row, ri) => {
            const isLast = ri === g.rows.length - 1;
            return (
              <View
                key={`${g.sectionTitle}-${row.description}-${ri}`}
                style={isLast ? styles.sectionGroupDataRowLast : styles.sectionGroupDataRow}
                wrap={false}
              >
                <View style={styles.descInnerCellBox}>
                  <Text style={styles.descText} wrap>
                    {row.description}
                  </Text>
                </View>
                {rowCellsForSlots(row, slots).map((cell, i) => {
                  return (
                    <View
                      key={`${row.description}-${cell.key}`}
                      style={[
                        styles.dataCellBox,
                        { width: dataW },
                        i === slots.length - 1 && styles.dataCellBoxLast,
                      ]}
                    >
                      <View style={styles.dataCellContent}>
                        <Text style={[styles.dataText, cell.red && styles.redText]} wrap={false}>
                          {cell.text}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      </View>
    ));
  };

  const renderGridRow = (
    row: ChillerGridFlatRow,
    rowKey: string,
    slots: DisplaySlot[],
    dataColWidth: string,
    forceEmptySection?: boolean,
  ) => (
    <View key={rowKey} style={styles.bodyRow} wrap={false}>
      {forceEmptySection ? (
        <View style={styles.cellSectionEmpty}>
          <Text> </Text>
        </View>
      ) : (
        renderSectionCell(row.sectionLabel)
      )}
      <View style={styles.descCellBox}>
        <Text style={styles.descText} wrap>
          {row.description}
        </Text>
      </View>
      {rowCellsForSlots(row, slots).map((cell, i) => {
        return (
          <View
            key={`${rowKey}-${cell.key}`}
            style={[
              styles.dataCellBox,
              { width: dataColWidth },
              i === slots.length - 1 && styles.dataCellBoxLast,
            ]}
          >
            <View style={styles.dataCellContent}>
              <Text style={[styles.dataText, cell.red && styles.redText]} wrap={false}>
                {cell.text}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );

  const renderSignoffTable = (slots: DisplaySlot[], dataColWidth: string) => (
    <View style={[styles.table, { marginTop: 6 }]} wrap>
      <View style={styles.tableDescriptionDivider} fixed />
      <View style={styles.headerRow} wrap={false}>
        <View style={styles.cellSectionEmpty}>
          <Text> </Text>
        </View>
        <Text style={[styles.cellDescription, { fontWeight: 'bold' }]}>DESCRIPTION</Text>
        {slots.map((slot, i) => (
          <Text
            key={`sg-h-${slot.key}`}
            style={[
              styles.cellData,
              { width: dataColWidth },
              i === slots.length - 1 && styles.cellDataLast,
            ]}
          >
            {slot.label}
          </Text>
        ))}
      </View>
      {renderGridRow(
        {
          sectionLabel: '',
          description: 'Remarks',
          values: slots.map((slot) => {
            const ci = slot.ci;
            if (ci == null) return '';
            return (grid.columns[ci]?.log.remarks || '').toString().trim();
          }),
          flags: slots.map(() => false),
        },
        'sg-remarks',
        slots,
        dataColWidth,
        true,
      )}
      {grid.finalSignoffRows.map((row, ri) =>
        renderGridRow(row, `sg-${ri}`, slots, dataColWidth, true),
      )}
    </View>
  );

  if (n === 0) {
    return (
      <Document>
        <Page size="A4" orientation="landscape" style={styles.page}>
          <PDFHeader />
          <Text style={styles.title}>Chiller monitoring — daily grid</Text>
          <Text style={styles.meta}>
            Equipment ID: {equipmentId} · Report date: {format(reportDate, 'dd-MMM-yyyy')}
          </Text>
          <Text style={{ fontSize: 9, marginTop: 20 }}>
            No approved operation readings for this equipment on this date.
          </Text>
          <View style={styles.footer}>
            <Text>Approved By: {approvedBy}</Text>
            <Text>Printed By: {printedBy}</Text>
          </View>
        </Page>
      </Document>
    );
  }

  return (
    <Document>
      {chunks.map((indices, pageIdx) => {
        const slots = makeDisplaySlots(grid.columns, indices);
        const dataColWidth = pctForDataColumns(slots.length);
        const isLastChunkPage = pageIdx === chunks.length - 1;

        return (
          <Page key={pageIdx} size="A4" orientation="landscape" style={styles.page}>
            <PDFHeader />
            <Text style={styles.title}>Chiller monitoring — daily grid</Text>
            <Text style={styles.meta}>
              Equipment ID: {equipmentId} · Report date: {grid.reportDateLabel}
              {chunks.length > 1 ? ` · Part ${pageIdx + 1} of ${chunks.length}` : ''}
            </Text>

            {/* One continuous table: parameters + operator + equipment status (handwritten layout). */}
            <View style={styles.table}>
              <View style={styles.tableDescriptionDivider} fixed />
              <View style={styles.headerRow} wrap={false}>
                {renderSectionCell('')}
                <Text style={[styles.cellDescription, { fontWeight: 'bold' }]}>DESCRIPTION</Text>
                {slots.map((slot, i) => (
                  <Text
                    key={slot.key}
                    style={[
                      styles.cellData,
                      { width: dataColWidth },
                      i === slots.length - 1 && styles.cellDataLast,
                    ]}
                  >
                    {slot.label}
                  </Text>
                ))}
              </View>
              {renderCoreSectionGroups(slots)}
              {renderGridRow(
                grid.operatorFooterRow,
                'operator-footer',
                slots,
                dataColWidth,
                true,
              )}
            </View>
            <View style={styles.statusFooterRow} wrap={false}>
              {statusFooterItems.map((item, idx) => (
                <Text
                  key={item.label}
                  style={[
                    styles.statusFooterItem,
                    idx === statusFooterItems.length - 1 && styles.statusFooterItemLast,
                  ]}
                  wrap={false}
                >
                  {item.label}: {item.value}
                </Text>
              ))}
            </View>

            {isLastChunkPage ? (
              <>
                {renderSignoffTable(slots, dataColWidth)}
                <View style={styles.logbookFooterRow} wrap={false}>
                  <Text style={{ flexShrink: 0 }}>Recording Frequency: Once in 4 hours.</Text>
                  <Text style={{ textAlign: 'right', maxWidth: '52%' }} wrap>
                    Verified By (Sign & Date): {verifiedSummary}
                  </Text>
                </View>
                <View style={styles.footer}>
                  <Text>Approved By: {approvedBy}</Text>
                  <Text>Printed By: {printedBy}</Text>
                </View>
              </>
            ) : (
              <Text style={styles.pageNote}>Continued on next page…</Text>
            )}
          </Page>
        );
      })}
    </Document>
  );
}
