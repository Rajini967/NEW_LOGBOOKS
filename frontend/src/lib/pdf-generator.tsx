import React from 'react';
import { pdf } from '@react-pdf/renderer';
// PDF generator for test certificates
import { AirVelocityCertificate } from '@/components/pdf/certificates/AirVelocityCertificate';
import { FilterIntegrityCertificate } from '@/components/pdf/certificates/FilterIntegrityCertificate';
import { RecoveryTestCertificate } from '@/components/pdf/certificates/RecoveryTestCertificate';
import { DifferentialPressureCertificate } from '@/components/pdf/certificates/DifferentialPressureCertificate';
import { NVPCCertificate } from '@/components/pdf/certificates/NVPCCertificate';
import { ChillerMonitoringCertificate } from '@/components/pdf/certificates/ChillerMonitoringCertificate';
import { BoilerMonitoringCertificate } from '@/components/pdf/certificates/BoilerMonitoringCertificate';
import { ChemicalMonitoringCertificate } from '@/components/pdf/certificates/ChemicalMonitoringCertificate';
import { FilterMonitoringCertificate } from '@/components/pdf/certificates/FilterMonitoringCertificate';
import {
  AirVelocityTestData,
  FilterIntegrityTestData,
  RecoveryTestData,
  DifferentialPressureTestData,
  NVPCTestData,
} from '@/types/test-certificates';

/** Data passed to monitoring PDF generators (chiller, boiler, chemical, filter). */
export type MonitoringPDFData = {
  logs: any[];
  approvedBy?: string;
  printedBy?: string;
};

/**
 * Generate Air Velocity Test PDF
 */
export async function generateAirVelocityPDF(data: AirVelocityTestData): Promise<Blob> {
  const doc = <AirVelocityCertificate data={data} />;
  const asPdf = pdf(doc);
  const blob = await asPdf.toBlob();
  return blob;
}

/**
 * Generate Filter Integrity Test PDF
 */
export async function generateFilterIntegrityPDF(data: FilterIntegrityTestData): Promise<Blob> {
  const doc = <FilterIntegrityCertificate data={data} />;
  const asPdf = pdf(doc);
  const blob = await asPdf.toBlob();
  return blob;
}

/**
 * Generate Recovery Test PDF
 */
export async function generateRecoveryTestPDF(data: RecoveryTestData): Promise<Blob> {
  const doc = <RecoveryTestCertificate data={data} />;
  const asPdf = pdf(doc);
  const blob = await asPdf.toBlob();
  return blob;
}

/**
 * Generate Differential Pressure Test PDF
 */
export async function generateDifferentialPressurePDF(data: DifferentialPressureTestData): Promise<Blob> {
  const doc = <DifferentialPressureCertificate data={data} />;
  const asPdf = pdf(doc);
  const blob = await asPdf.toBlob();
  return blob;
}

/**
 * Generate NVPC Test PDF
 */
export async function generateNVPCPDF(data: NVPCTestData): Promise<Blob> {
  const doc = <NVPCCertificate data={data} />;
  const asPdf = pdf(doc);
  const blob = await asPdf.toBlob();
  return blob;
}

/**
 * Generate Chiller Monitoring PDF
 */
export async function generateChillerMonitoringPDF(data: MonitoringPDFData): Promise<Blob> {
  const doc = <ChillerMonitoringCertificate data={data} />;
  const asPdf = pdf(doc);
  const blob = await asPdf.toBlob();
  return blob;
}

/**
 * Generate Boiler Monitoring PDF
 */
export async function generateBoilerMonitoringPDF(data: MonitoringPDFData): Promise<Blob> {
  const doc = <BoilerMonitoringCertificate data={data} />;
  const asPdf = pdf(doc);
  const blob = await asPdf.toBlob();
  return blob;
}

/**
 * Generate Chemical Monitoring PDF
 */
export async function generateChemicalMonitoringPDF(data: MonitoringPDFData): Promise<Blob> {
  const doc = <ChemicalMonitoringCertificate data={data} />;
  const asPdf = pdf(doc);
  const blob = await asPdf.toBlob();
  return blob;
}

/**
 * Generate Filter Monitoring PDF
 */
export async function generateFilterMonitoringPDF(data: MonitoringPDFData): Promise<Blob> {
  const doc = <FilterMonitoringCertificate data={data} />;
  const asPdf = pdf(doc);
  const blob = await asPdf.toBlob();
  return blob;
}

/**
 * Download PDF blob
 */
export function downloadPDF(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Open PDF in new window
 */
export function openPDF(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  // Clean up after a delay
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/**
 * Open PDF and trigger print dialog immediately
 * Uses a hidden iframe to load PDF and trigger print dialog directly without showing the document
 */
export function printPDF(blob: Blob): boolean {
  const url = URL.createObjectURL(blob);
  
  // Create a hidden iframe to load the PDF
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.visibility = 'hidden';
  iframe.style.zIndex = '-1';
  
  document.body.appendChild(iframe);
  
  let hasPrinted = false; // Flag to ensure print is only triggered once
  
  // Function to trigger print dialog (only once)
  const triggerPrint = () => {
    if (hasPrinted) return; // Prevent multiple print dialogs
    
    try {
      if (iframe.contentWindow) {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        hasPrinted = true;
      }
    } catch (error) {
      console.error('Error triggering print:', error);
      // Fallback: if iframe fails, try opening in new window
      if (!hasPrinted) {
        const printWindow = window.open(url, '_blank');
        if (printWindow) {
          setTimeout(() => {
            printWindow.focus();
            printWindow.print();
          }, 1000);
        }
        hasPrinted = true;
      }
    }
  };
  
  // Set the PDF URL
  iframe.src = url;
  
  // Wait for PDF to load, then trigger print
  iframe.onload = () => {
    // Small delay to ensure PDF is fully rendered
    setTimeout(triggerPrint, 500);
  };
  
  // Fallback: if onload doesn't fire, try after a delay
  setTimeout(() => {
    if (!hasPrinted) {
      triggerPrint();
    }
  }, 2000);
  
  // Keep iframe in DOM to maintain print dialog
  // Only clean up blob URL after a long delay
  // Don't remove iframe immediately - it will close the print dialog
  setTimeout(() => {
    // Revoke URL after print dialog should be done (30 seconds)
    // Keep iframe in DOM to prevent dialog from closing
    URL.revokeObjectURL(url);
  }, 30000);
  
  // Clean up iframe after a very long delay (5 minutes) or never
  // Removing iframe too early will close the print dialog
  setTimeout(() => {
    if (iframe.parentNode) {
      document.body.removeChild(iframe);
    }
  }, 300000); // 5 minutes - by then user should be done
  
  return true;
}

