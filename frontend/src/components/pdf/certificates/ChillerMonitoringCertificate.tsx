import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { PDFHeader } from '../PDFHeader';

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 20,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: -2,
    marginBottom: 10,
  },
  detailsSubtitle: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: 0,
    marginBottom: 10,
  },
  table: {
    width: '100%',
    marginTop: 10,
    marginBottom: 20,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #000',
    minHeight: 20,
  },
  tableHeader: {
    backgroundColor: '#e0e0e0',
    fontWeight: 'bold',
    borderBottom: '2 solid #000',
  },
  tableCell: {
    padding: 6,
    fontSize: 8,
    borderRight: '1 solid #000',
    textAlign: 'center',
  },
  tableCellLeft: {
    textAlign: 'left',
  },
  tableCellLast: {
    borderRight: 'none',
  },
  limitRow: {
    backgroundColor: '#f0f0f0',
    fontWeight: 'bold',
  },
  redText: {
    color: '#ff0000',
  },
  footer: {
    marginTop: 20,
    fontSize: 10,
  },
  footerLine: {
    marginBottom: 5,
  },
  detailsTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 8,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  smallCell: {
    fontSize: 7,
    padding: 4,
  },
});

type LimitConfig =
  | { type: 'NMT'; max: number; unit: string }
  | { type: 'NLT'; min: number; unit: string };

interface ChillerMonitoringData {
  approvedBy?: string;
  printedBy?: string;
  logs: Array<{
    date: string;
    time: string;
    equipmentId: string;
    // Evaporator
    evapWaterInletPressure?: number;
    evapWaterOutletPressure?: number;
    evapEnteringWaterTemp?: number;
    evapLeavingWaterTemp?: number;
    evapApproachTemp?: number;
    // Condenser
    condWaterInletPressure?: number;
    condWaterOutletPressure?: number;
    condEnteringWaterTemp?: number;
    condLeavingWaterTemp?: number;
    condApproachTemp?: number;
    // Electrical / control
    chillerControlSignal?: number;
    avgMotorCurrent?: number;
    compressorRunningTimeMin?: number;
    starterEnergyKwh?: number;
    // Status / consumption
    coolingTowerPumpStatus?: string;
    chilledWaterPumpStatus?: string;
    coolingTowerFanStatus?: string;
    coolingTowerBlowoffValveStatus?: string;
    coolingTowerBlowdownTimeMin?: number;
    dailyWaterConsumptionCt1Liters?: number;
    dailyWaterConsumptionCt2Liters?: number;
    dailyWaterConsumptionCt3Liters?: number;
    coolingTowerChemicalName?: string;
    coolingTowerChemicalQtyPerDay?: number;
    chilledWaterPumpChemicalName?: string;
    chilledWaterPumpChemicalQtyKg?: number;
    coolingTowerFanChemicalName?: string;
    coolingTowerFanChemicalQtyKg?: number;
    recordingFrequency?: string;
    operatorSign?: string;
    verifiedBy?: string;
    comment?: string;
    remarks?: string;
    checkedBy?: string;
  }>;
}

interface ChillerMonitoringCertificateProps {
  data: ChillerMonitoringData;
}

export function ChillerMonitoringCertificate({ data }: ChillerMonitoringCertificateProps) {
  const limits: Record<string, LimitConfig> = {
    // Evaporator (from model help_text)
    evapWaterInletPressure: { type: 'NLT', min: 2.5, unit: 'kg/cm²' },
    evapEnteringWaterTemp: { type: 'NMT', max: 18, unit: '°C' },
    evapApproachTemp: { type: 'NMT', max: 4, unit: '°C' },
    // Condenser (from model help_text)
    condWaterInletPressure: { type: 'NLT', min: 1.5, unit: 'kg/cm²' },
    condWaterOutletPressure: { type: 'NLT', min: 1.0, unit: 'kg/cm²' },
    condEnteringWaterTemp: { type: 'NMT', max: 35, unit: '°C' },
    condLeavingWaterTemp: { type: 'NMT', max: 40, unit: '°C' },
  };

  const checkLimit = (field: string, value: number | undefined): boolean => {
    if (value === undefined) return false;
    const limit = limits[field];
    if (!limit) return false;
    if (limit.type === 'NMT' && 'max' in limit) {
      return value > limit.max;
    }
    if (limit.type === 'NLT' && 'min' in limit) {
      return value < limit.min;
    }
    return false;
  };

  const footerRemarks =
    data.logs.find((log) => (log.remarks || '').toString().trim().length > 0)?.remarks || '';
  const doneBy = data.logs[0]?.checkedBy ?? '';
  const approvedBy = (data.approvedBy || '').toString().trim();
  const printedBy = (data.printedBy || '').toString().trim();
  const equipmentType = (data.logs[0] as any)?.equipmentType || 'chiller';
  const equipmentTitle =
    equipmentType === 'boiler'
      ? 'BOILER'
      : equipmentType === 'chemical'
      ? 'CHEMICAL'
      : equipmentType === 'filter'
      ? 'FILTER'
      : 'CHILLER';
  const equipmentId = (data.logs[0] as any)?.equipmentId || '-';
  const parseStatus = (value?: string, key?: string, index?: number) => {
    if (!value) return '';
    const raw = String(value);
    const parts = raw
      .split(/[\/,\n]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    const cleanToken = (token: string) =>
      token
        .replace(/^(?:pump|fan)?\s*[0-9]+\s*:\s*/i, '')
        .replace(/^[A-Za-z][0-9]+\s*:\s*/i, '')
        .trim();
    const normalizeOnOff = (token: string) => {
      const m = cleanToken(token).match(/\b(ON|OFF)\b/i);
      return m ? m[1].toUpperCase() : cleanToken(token);
    };
    if (!key && index == null) return cleanToken(parts[0] || value);

    // Prefer keyed values like "P1: ON / P2: OFF"
    if (key) {
      const keyRegex = new RegExp(`${key}\\s*:\\s*(ON|OFF)`, 'i');
      const keyMatch = raw.match(keyRegex);
      if (keyMatch && keyMatch[1]) return keyMatch[1].toUpperCase();
    }

    const hit = key ? parts.find((p) => p.toUpperCase().startsWith(`${key.toUpperCase()}:`)) : undefined;
    if (hit) {
      const v = normalizeOnOff(hit);
      if (v) return v;
    }

    // Extract ON/OFF tokens directly from full raw text
    const statusTokens = Array.from(raw.matchAll(/\b(ON|OFF)\b/gi)).map((m) => m[1].toUpperCase());
    if (index != null && statusTokens[index]) return statusTokens[index];

    // Fallback for positional values like "ON/OFF" or "ON/OFF/OFF"
    if (index != null && parts[index]) return normalizeOnOff(parts[index]);
    return '';
  };
  const wrapUser = (value?: string) => (value ? String(value).replace('@', '@\n') : '');

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <PDFHeader />
        <Text style={styles.title}>RAW DATA FOR {equipmentTitle} MONITORING</Text>
        <Text style={styles.detailsTitle}>DETAILS - ALL PARAMETERS</Text>
        <Text style={styles.detailsSubtitle}>Equipment ID: {equipmentId}</Text>

        {/* Evaporator */}
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableCell, styles.smallCell, { width: '10%' }]}>Date</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '10%' }]}>Time</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '16%' }]}>Evap inlet pressure</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '16%' }]}>Evap outlet pressure</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '16%' }]}>Evap entering temp</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '16%' }]}>Evap leaving temp</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '16%' }, styles.tableCellLast]}>Evap approach</Text>
          </View>

          {data.logs.map((log, index) => (
            <View key={`evap-${index}`} style={styles.tableRow}>
              <Text style={[styles.tableCell, styles.smallCell, { width: '10%' }]}>{log.date || ''}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '10%' }]}>{log.time || ''}</Text>
              <Text
                style={[
                  styles.tableCell,
                  styles.smallCell,
                  { width: '16%' },
                  checkLimit('evapWaterInletPressure', log.evapWaterInletPressure) && styles.redText,
                ]}
              >
                {log.evapWaterInletPressure ?? ''}
              </Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '16%' }]}>{log.evapWaterOutletPressure ?? ''}</Text>
              <Text
                style={[
                  styles.tableCell,
                  styles.smallCell,
                  { width: '16%' },
                  checkLimit('evapEnteringWaterTemp', log.evapEnteringWaterTemp) && styles.redText,
                ]}
              >
                {log.evapEnteringWaterTemp ?? ''}
              </Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '16%' }]}>{log.evapLeavingWaterTemp ?? ''}</Text>
              <Text
                style={[
                  styles.tableCell,
                  styles.smallCell,
                  { width: '16%' },
                  styles.tableCellLast,
                  checkLimit('evapApproachTemp', log.evapApproachTemp) && styles.redText,
                ]}
              >
                {log.evapApproachTemp ?? ''}
              </Text>
            </View>
          ))}
        </View>

        {/* Condenser + Electrical */}
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableCell, styles.smallCell, { width: '8%' }]}>Date</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '8%' }]}>Time</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '12%' }]}>Cond inlet P</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '12%' }]}>Cond outlet P</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '12%' }]}>Cond enter T</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '12%' }]}>Cond leave T</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '10%' }]}>Cond approach</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '10%' }]}>Control %</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '10%' }]}>Motor A</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '10%' }, styles.tableCellLast]}>Energy kWh</Text>
          </View>

          {data.logs.map((log, index) => (
            <View key={`cond-${index}`} style={styles.tableRow}>
              <Text style={[styles.tableCell, styles.smallCell, { width: '8%' }]}>{log.date || ''}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '8%' }]}>{log.time || ''}</Text>
              <Text
                style={[
                  styles.tableCell,
                  styles.smallCell,
                  { width: '12%' },
                  checkLimit('condWaterInletPressure', log.condWaterInletPressure) && styles.redText,
                ]}
              >
                {log.condWaterInletPressure ?? ''}
              </Text>
              <Text
                style={[
                  styles.tableCell,
                  styles.smallCell,
                  { width: '12%' },
                  checkLimit('condWaterOutletPressure', log.condWaterOutletPressure) && styles.redText,
                ]}
              >
                {log.condWaterOutletPressure ?? ''}
              </Text>
              <Text
                style={[
                  styles.tableCell,
                  styles.smallCell,
                  { width: '12%' },
                  checkLimit('condEnteringWaterTemp', log.condEnteringWaterTemp) && styles.redText,
                ]}
              >
                {log.condEnteringWaterTemp ?? ''}
              </Text>
              <Text
                style={[
                  styles.tableCell,
                  styles.smallCell,
                  { width: '12%' },
                  checkLimit('condLeavingWaterTemp', log.condLeavingWaterTemp) && styles.redText,
                ]}
              >
                {log.condLeavingWaterTemp ?? ''}
              </Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '10%' }]}>{log.condApproachTemp ?? ''}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '10%' }]}>{log.chillerControlSignal ?? ''}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '10%' }]}>{log.avgMotorCurrent ?? ''}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '10%' }, styles.tableCellLast]}>{log.starterEnergyKwh ?? ''}</Text>
            </View>
          ))}
        </View>

        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableCell, styles.smallCell, { width: '7%' }]}>Date</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '7%' }]}>Time</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '14%' }]}>Cooling Tower-1</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '14%' }]}>Chilled Water Pump</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '14%' }]}>Cooling Tower Fan</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '11%' }]}>Cooling Tower Blow Down Time (Minutes)</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '11%' }]}>Recording Frequency</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '11%' }]}>Verified By</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '11%' }, styles.tableCellLast]}>Operator Sign</Text>
          </View>

          {data.logs.map((log, index) => (
            <View key={`status-${index}`} style={styles.tableRow}>
              <Text style={[styles.tableCell, styles.smallCell, { width: '7%' }]}>{log.date || ''}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '7%' }]}>{log.time || ''}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '14%' }]}>
                {`Pump 1: ${parseStatus(log.coolingTowerPumpStatus, 'P1', 0) || ''}\nPump 2: ${parseStatus(log.coolingTowerPumpStatus, 'P2', 1) || ''}`}
              </Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '14%' }]}>
                {`Pump 1: ${parseStatus(log.chilledWaterPumpStatus, 'P1', 0) || ''}\nPump 2: ${parseStatus(log.chilledWaterPumpStatus, 'P2', 1) || ''}`}
              </Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '14%' }]}>
                {`Fan 1: ${parseStatus(log.coolingTowerFanStatus, 'F1', 0) || ''}\nFan 2: ${parseStatus(log.coolingTowerFanStatus, 'F2', 1) || ''}\nFan 3: ${parseStatus(log.coolingTowerFanStatus, 'F3', 2) || ''}`}
              </Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '11%' }]}>{log.coolingTowerBlowdownTimeMin ?? ''}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '11%' }]}>{log.recordingFrequency || ''}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '11%' }]}>{wrapUser(log.verifiedBy)}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '11%' }, styles.tableCellLast]}>{wrapUser(log.operatorSign)}</Text>
            </View>
          ))}
        </View>
      </Page>

      <Page size="A4" style={styles.page}>
        <PDFHeader />
        <Text style={styles.title}>RAW DATA FOR {equipmentTitle} MONITORING</Text>
        <Text style={styles.subtitle}>Equipment ID: {equipmentId}</Text>

        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableCell, { width: '10%' }]}>Date</Text>
            <Text style={[styles.tableCell, { width: '10%' }]}>Time</Text>
            <Text style={[styles.tableCell, { width: '35%' }]}>Remarks</Text>
            <Text style={[styles.tableCell, { width: '25%' }]}>Done By</Text>
            <Text style={[styles.tableCell, { width: '20%' }, styles.tableCellLast]}>Approved By</Text>
          </View>

          {data.logs.map((log, index) => (
            <View key={`remarks-${index}`} style={styles.tableRow}>
              <Text style={[styles.tableCell, { width: '10%' }]}>{log.date === 'Automatic' || !log.date ? 'Automatic' : log.date}</Text>
              <Text style={[styles.tableCell, { width: '10%' }]}>{log.time === 'Automatic' || !log.time ? 'Automatic' : log.time}</Text>
              <Text style={[styles.tableCell, { width: '35%' }]}>{log.remarks || '-'}</Text>
              <Text style={[styles.tableCell, { width: '25%' }]}>{log.checkedBy || ''}</Text>
              <Text style={[styles.tableCell, { width: '20%' }, styles.tableCellLast]}>{approvedBy || '-'}</Text>
            </View>
          ))}

          {Array.from({ length: Math.max(0, 10 - data.logs.length) }).map((_, index) => (
            <View key={`empty-remarks-${index}`} style={styles.tableRow}>
              <Text style={[styles.tableCell, { width: '10%' }]}></Text>
              <Text style={[styles.tableCell, { width: '10%' }]}></Text>
              <Text style={[styles.tableCell, { width: '35%' }]}></Text>
              <Text style={[styles.tableCell, { width: '25%' }]}></Text>
              <Text style={[styles.tableCell, { width: '20%' }, styles.tableCellLast]}></Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerLine}>Printed By: {printedBy || '-'}</Text>
          <Text style={styles.footerLine}>Digital sign</Text>
        </View>
      </Page>
    </Document>
  );
}

