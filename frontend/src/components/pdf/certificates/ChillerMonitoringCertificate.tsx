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
    chillerSupplyTemp?: number;
    chillerReturnTemp?: number;
    coolingTowerSupplyTemp?: number;
    coolingTowerReturnTemp?: number;
    ctDifferentialTemp?: number;
    chillerWaterInletPressure?: number;
    chillerMakeupWaterFlow?: number;
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
    // Summary row
    chillerSupplyTemp: { type: 'NMT', max: 8, unit: '°C' },
    chillerReturnTemp: { type: 'NMT', max: 15, unit: '°C' },
    coolingTowerSupplyTemp: { type: 'NMT', max: 25, unit: '°C' },
    coolingTowerReturnTemp: { type: 'NMT', max: 30, unit: '°C' },
    ctDifferentialTemp: { type: 'NMT', max: 5, unit: '°C' },
    chillerWaterInletPressure: { type: 'NLT', min: 2, unit: 'bar' },
    // Evaporator (from model help_text)
    evapWaterInletPressure: { type: 'NLT', min: 2.3, unit: 'kg/cm²' },
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

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <PDFHeader />
        
        <Text style={styles.title}>RAW DATA FOR CHILLER MONITORING</Text>

        <View style={styles.table}>
          {/* Header Row */}
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableCell, { width: '7%' }]}>Date</Text>
            <Text style={[styles.tableCell, { width: '7%' }]}>Time</Text>
            <Text style={[styles.tableCell, { width: '11%' }]}>Chiller supply temp</Text>
            <Text style={[styles.tableCell, { width: '11%' }]}>Chiller return temp</Text>
            <Text style={[styles.tableCell, { width: '11%' }]}>Cooling tower supply temp</Text>
            <Text style={[styles.tableCell, { width: '11%' }]}>Cooling tower Return temp</Text>
            <Text style={[styles.tableCell, { width: '9%' }]}>CT Differential temperature</Text>
            <Text style={[styles.tableCell, { width: '9%' }]}>Chiller water inlet pressure</Text>
            <Text style={[styles.tableCell, { width: '7%' }]}>Chiller make up water Flow</Text>
            <Text style={[styles.tableCell, { width: '9%' }]}>Remarks</Text>
            <Text style={[styles.tableCell, { width: '9%' }, styles.tableCellLast]}>Done By</Text>
          </View>

          {/* Limits Row */}
          <View style={[styles.tableRow, styles.limitRow]}>
            <Text style={[styles.tableCell, { width: '7%' }]}>Limits</Text>
            <Text style={[styles.tableCell, { width: '7%' }]}></Text>
            <Text style={[styles.tableCell, { width: '11%' }]}>NMT 8 °C</Text>
            <Text style={[styles.tableCell, { width: '11%' }]}>NMT 15 °C</Text>
            <Text style={[styles.tableCell, { width: '11%' }]}>NMT 25 °C</Text>
            <Text style={[styles.tableCell, { width: '11%' }]}>NMT 30 °C</Text>
            <Text style={[styles.tableCell, { width: '9%' }]}>NMT 5 °C</Text>
            <Text style={[styles.tableCell, { width: '9%' }]}>NLT 2 bar</Text>
            <Text style={[styles.tableCell, { width: '7%' }]}>LPH</Text>
            <Text style={[styles.tableCell, { width: '9%' }]}></Text>
            <Text style={[styles.tableCell, { width: '9%' }, styles.tableCellLast]}></Text>
          </View>

          {/* Data Rows */}
          {data.logs.map((log, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={[styles.tableCell, { width: '7%' }]}>{log.date === 'Automatic' || !log.date ? 'Automatic' : log.date}</Text>
              <Text style={[styles.tableCell, { width: '7%' }]}>{log.time === 'Automatic' || !log.time ? 'Automatic' : log.time}</Text>
              <Text style={[
                styles.tableCell, 
                { width: '11%' },
                checkLimit('chillerSupplyTemp', log.chillerSupplyTemp) && styles.redText
              ]}>
                {log.chillerSupplyTemp !== undefined ? log.chillerSupplyTemp : ''}
              </Text>
              <Text style={[
                styles.tableCell, 
                { width: '11%' },
                checkLimit('chillerReturnTemp', log.chillerReturnTemp) && styles.redText
              ]}>
                {log.chillerReturnTemp !== undefined ? log.chillerReturnTemp : ''}
              </Text>
              <Text style={[
                styles.tableCell, 
                { width: '11%' },
                checkLimit('coolingTowerSupplyTemp', log.coolingTowerSupplyTemp) && styles.redText
              ]}>
                {log.coolingTowerSupplyTemp !== undefined ? log.coolingTowerSupplyTemp : ''}
              </Text>
              <Text style={[
                styles.tableCell, 
                { width: '11%' },
                checkLimit('coolingTowerReturnTemp', log.coolingTowerReturnTemp) && styles.redText
              ]}>
                {log.coolingTowerReturnTemp !== undefined ? log.coolingTowerReturnTemp : ''}
              </Text>
              <Text style={[
                styles.tableCell, 
                { width: '9%' },
                checkLimit('ctDifferentialTemp', log.ctDifferentialTemp) && styles.redText
              ]}>
                {log.ctDifferentialTemp !== undefined ? log.ctDifferentialTemp : ''}
              </Text>
              <Text style={[
                styles.tableCell, 
                { width: '9%' },
                checkLimit('chillerWaterInletPressure', log.chillerWaterInletPressure) && styles.redText
              ]}>
                {log.chillerWaterInletPressure !== undefined ? log.chillerWaterInletPressure : ''}
              </Text>
              <Text style={[styles.tableCell, { width: '7%' }]}>
                {log.chillerMakeupWaterFlow !== undefined ? log.chillerMakeupWaterFlow : ''}
              </Text>
              <Text style={[styles.tableCell, { width: '9%' }]}>
                {log.remarks || '-'}
              </Text>
              <Text style={[styles.tableCell, { width: '9%' }, styles.tableCellLast]}>
                {log.checkedBy || ''}
              </Text>
            </View>
          ))}

          {/* Empty rows for additional entries */}
          {Array.from({ length: Math.max(0, 10 - data.logs.length) }).map((_, index) => (
            <View key={`empty-${index}`} style={styles.tableRow}>
              <Text style={[styles.tableCell, { width: '7%' }]}></Text>
              <Text style={[styles.tableCell, { width: '7%' }]}></Text>
              <Text style={[styles.tableCell, { width: '11%' }]}></Text>
              <Text style={[styles.tableCell, { width: '11%' }]}></Text>
              <Text style={[styles.tableCell, { width: '11%' }]}></Text>
              <Text style={[styles.tableCell, { width: '11%' }]}></Text>
              <Text style={[styles.tableCell, { width: '9%' }]}></Text>
              <Text style={[styles.tableCell, { width: '9%' }]}></Text>
              <Text style={[styles.tableCell, { width: '7%' }]}></Text>
              <Text style={[styles.tableCell, { width: '9%' }]}></Text>
              <Text style={[styles.tableCell, { width: '9%' }, styles.tableCellLast]}></Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerLine}>Remarks: {footerRemarks ? String(footerRemarks) : '-'}</Text>
          <Text style={styles.footerLine}>Done By: {doneBy || '-'}</Text>
          <Text style={styles.footerLine}>Approved By: {data.approvedBy || '-'}</Text>
          <Text style={styles.footerLine}>Printed By: {data.printedBy || '-'}</Text>
        </View>
      </Page>

      {/* DETAILS – All parameters on one page */}
      <Page size="A4" style={styles.page}>
        <PDFHeader />
        <Text style={styles.detailsTitle}>RAW DATA FOR CHILLER MONITORING (DETAILS – ALL PARAMETERS)</Text>

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

        {/* Water, chemicals & status */}
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableCell, styles.smallCell, { width: '10%' }]}>Date</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '10%' }]}>Time</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '18%' }]}>CT 1 – Daily water (L)</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '18%' }]}>CT 2 – Daily water (L)</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '18%' }]}>CT 3 – Daily water (L)</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '18%' }]}>CT Blow down time (min)</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '8%' }, styles.tableCellLast]}>Status</Text>
          </View>

          {data.logs.map((log, index) => (
            <View key={`water-${index}`} style={styles.tableRow}>
              <Text style={[styles.tableCell, styles.smallCell, { width: '10%' }]}>{log.date || ''}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '10%' }]}>{log.time || ''}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '18%' }]}>{log.dailyWaterConsumptionCt1Liters ?? ''}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '18%' }]}>{log.dailyWaterConsumptionCt2Liters ?? ''}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '18%' }]}>{log.dailyWaterConsumptionCt3Liters ?? ''}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '18%' }]}>{log.coolingTowerBlowdownTimeMin ?? ''}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '8%' }, styles.tableCellLast]}>
                {(log.coolingTowerPumpStatus || log.chilledWaterPumpStatus || log.coolingTowerFanStatus) ? 'See below' : ''}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableCell, styles.smallCell, { width: '8%' }]}>Date</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '8%' }]}>Time</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '10%' }]}>CT Pump status</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '10%' }]}>Chilled Pump status</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '10%' }]}>CT Fan status</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '12%' }]}>CT Pump chem (name / kg)</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '12%' }]}>Chilled Pump chem (name / kg)</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '12%' }]}>CT Fan chem (name / kg)</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '9%' }]}>Recording freq</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '9%' }]}>Operator sign</Text>
            <Text style={[styles.tableCell, styles.smallCell, { width: '10%' }, styles.tableCellLast]}>Verified by</Text>
          </View>

          {data.logs.map((log, index) => (
            <View key={`status-${index}`} style={styles.tableRow}>
              <Text style={[styles.tableCell, styles.smallCell, { width: '8%' }]}>{log.date || ''}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '8%' }]}>{log.time || ''}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '10%' }]}>{log.coolingTowerPumpStatus || ''}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '10%' }]}>{log.chilledWaterPumpStatus || ''}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '10%' }]}>{log.coolingTowerFanStatus || ''}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '12%' }]}>
                {log.coolingTowerChemicalName
                  ? `${log.coolingTowerChemicalName}${log.coolingTowerChemicalQtyPerDay != null ? ` / ${log.coolingTowerChemicalQtyPerDay}` : ''}`
                  : ''}
              </Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '12%' }]}>
                {log.chilledWaterPumpChemicalName
                  ? `${log.chilledWaterPumpChemicalName}${log.chilledWaterPumpChemicalQtyKg != null ? ` / ${log.chilledWaterPumpChemicalQtyKg}` : ''}`
                  : ''}
              </Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '12%' }]}>
                {log.coolingTowerFanChemicalName
                  ? `${log.coolingTowerFanChemicalName}${log.coolingTowerFanChemicalQtyKg != null ? ` / ${log.coolingTowerFanChemicalQtyKg}` : ''}`
                  : ''}
              </Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '9%' }]}>{log.recordingFrequency || ''}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '9%' }]}>{log.operatorSign || ''}</Text>
              <Text style={[styles.tableCell, styles.smallCell, { width: '10%' }, styles.tableCellLast]}>{log.verifiedBy || ''}</Text>
            </View>
          ))}
        </View>

        {/* Footer with overall remarks and digital sign */}
        <View style={styles.footer}>
          <Text style={styles.footerLine}>
            Remarks: {footerRemarks ? String(footerRemarks) : ''}
          </Text>
          <Text style={styles.footerLine}>Digital sign</Text>
        </View>
      </Page>
    </Document>
  );
}

