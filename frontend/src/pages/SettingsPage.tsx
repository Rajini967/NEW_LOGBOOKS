import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Building2,
  Bell,
  Shield,
  Database,
  Mail,
  Clock,
  Save,
  RefreshCw,
  Lock,
  Thermometer,
  Flame,
} from 'lucide-react';
import { toast } from 'sonner';
import { authAPI, equipmentCategoryAPI, equipmentAPI, chillerLimitsAPI, boilerLimitsAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import type { LogEntryIntervalType } from '@/types';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { refreshSessionSettings } = useAuth();
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState<number | ''>('');
  const [logEntryInterval, setLogEntryInterval] = useState<LogEntryIntervalType>('hourly');
  const [shiftDurationHours, setShiftDurationHours] = useState<number>(8);
  const [isSessionLoading, setIsSessionLoading] = useState(false);
  const [chillerEquipment, setChillerEquipment] = useState<{ id: string; equipment_number: string; name: string }[]>([]);
  const [chillerLimits, setChillerLimits] = useState<Record<string, {
    daily_power_limit_kw?: number | null;
    daily_water_ct1_liters?: number | null;
    daily_water_ct2_liters?: number | null;
    daily_water_ct3_liters?: number | null;
    daily_chemical_ct1_kg?: number | null;
    daily_chemical_ct2_kg?: number | null;
    daily_chemical_ct3_kg?: number | null;
  }>>({});
  const [chillerLimitsLoading, setChillerLimitsLoading] = useState(false);
  const [chillerLimitSaving, setChillerLimitSaving] = useState<string | null>(null);
  const [selectedChillerForLimits, setSelectedChillerForLimits] = useState<string>('');
  const [boilerEquipment, setBoilerEquipment] = useState<{ id: string; equipment_number: string; name: string }[]>([]);
  const [boilerLimits, setBoilerLimits] = useState<Record<string, {
    daily_power_limit_kw?: number | null;
    daily_water_limit_liters?: number | null;
    daily_chemical_limit_kg?: number | null;
    daily_diesel_limit_liters?: number | null;
    daily_furnace_oil_limit_liters?: number | null;
    daily_brigade_limit_kg?: number | null;
    daily_steam_limit_kg_hr?: number | null;
    electricity_rate_rs_per_kwh?: number | null;
    diesel_rate_rs_per_liter?: number | null;
    furnace_oil_rate_rs_per_liter?: number | null;
    brigade_rate_rs_per_kg?: number | null;
  }>>({});
  const [boilerLimitsLoading, setBoilerLimitsLoading] = useState(false);
  const [boilerLimitSaving, setBoilerLimitSaving] = useState<string | null>(null);
  const [selectedBoilerForLimits, setSelectedBoilerForLimits] = useState<string>('');

  useEffect(() => {
    const loadSessionSettings = async () => {
      setIsSessionLoading(true);
      try {
        const data = await authAPI.getSessionSettings();
        if (typeof data.auto_logout_minutes === 'number') {
          setSessionTimeoutMinutes(data.auto_logout_minutes);
        }
        if (data.log_entry_interval === 'hourly' || data.log_entry_interval === 'shift' || data.log_entry_interval === 'daily') {
          setLogEntryInterval(data.log_entry_interval);
        }
        if (typeof data.shift_duration_hours === 'number' && data.shift_duration_hours >= 1 && data.shift_duration_hours <= 24) {
          setShiftDurationHours(data.shift_duration_hours);
        }
      } catch (error: any) {
        console.error('Failed to load session settings:', error);
        toast.error('Failed to load session timeout settings');
      } finally {
        setIsSessionLoading(false);
      }
    };

    loadSessionSettings();
  }, []);

  useEffect(() => {
    const loadChillerData = async () => {
      setChillerLimitsLoading(true);
      try {
        const categories = (await equipmentCategoryAPI.list()) as { id: string; name: string }[];
        let chillerCategoryId: string | null = null;
        for (const c of categories) {
          const name = (c.name || '').toLowerCase().trim();
          if (name === 'chiller' || name === 'chillers') {
            chillerCategoryId = c.id;
            break;
          }
        }
        if (!chillerCategoryId) {
          setChillerEquipment([]);
          setChillerLimits({});
          return;
        }
        const list = (await equipmentAPI.list({ category: chillerCategoryId })) as any[];
        const chillers = (list || [])
          .filter((e: any) => e?.is_active !== false)
          .map((e: any) => ({ id: e.id, equipment_number: e.equipment_number || '', name: e.name || '' }));
        setChillerEquipment(chillers);
        const limitsByEq: Record<string, any> = {};
        for (const eq of chillers) {
          try {
            const limit = await chillerLimitsAPI.get(eq.equipment_number);
            limitsByEq[eq.equipment_number] = {
              daily_power_limit_kw: limit.daily_power_limit_kw ?? null,
              daily_water_ct1_liters: limit.daily_water_ct1_liters ?? null,
              daily_water_ct2_liters: limit.daily_water_ct2_liters ?? null,
              daily_water_ct3_liters: limit.daily_water_ct3_liters ?? null,
              daily_chemical_ct1_kg: limit.daily_chemical_ct1_kg ?? null,
              daily_chemical_ct2_kg: limit.daily_chemical_ct2_kg ?? null,
              daily_chemical_ct3_kg: limit.daily_chemical_ct3_kg ?? null,
            };
          } catch {
            limitsByEq[eq.equipment_number] = {
              daily_power_limit_kw: null,
              daily_water_ct1_liters: null,
              daily_water_ct2_liters: null,
              daily_water_ct3_liters: null,
              daily_chemical_ct1_kg: null,
              daily_chemical_ct2_kg: null,
              daily_chemical_ct3_kg: null,
            };
          }
        }
        setChillerLimits(limitsByEq);
      } catch (e) {
        console.error('Failed to load chiller limits data', e);
        toast.error('Failed to load chiller equipment');
      } finally {
        setChillerLimitsLoading(false);
      }
    };
    loadChillerData();
  }, []);

  // When chiller list first loads, select first chiller
  useEffect(() => {
    if (chillerEquipment.length > 0 && !selectedChillerForLimits) {
      setSelectedChillerForLimits(chillerEquipment[0].equipment_number);
    }
  }, [chillerEquipment]);

  useEffect(() => {
    const loadBoilerData = async () => {
      setBoilerLimitsLoading(true);
      try {
        const categories = (await equipmentCategoryAPI.list()) as { id: string; name: string }[];
        let boilerCategoryId: string | null = null;
        for (const c of categories) {
          const name = (c.name || '').toLowerCase().trim();
          if (name === 'boiler' || name === 'boilers') {
            boilerCategoryId = c.id;
            break;
          }
        }
        if (!boilerCategoryId) {
          setBoilerEquipment([]);
          setBoilerLimits({});
          return;
        }
        const list = (await equipmentAPI.list({ category: boilerCategoryId })) as any[];
        const boilers = (list || [])
          .filter((e: any) => e?.is_active !== false)
          .map((e: any) => ({ id: e.id, equipment_number: e.equipment_number || '', name: e.name || '' }));
        setBoilerEquipment(boilers);
        const limitsByEq: Record<string, {
          daily_power_limit_kw?: number | null;
          daily_water_limit_liters?: number | null;
          daily_chemical_limit_kg?: number | null;
          daily_diesel_limit_liters?: number | null;
          daily_furnace_oil_limit_liters?: number | null;
          daily_brigade_limit_kg?: number | null;
          daily_steam_limit_kg_hr?: number | null;
          electricity_rate_rs_per_kwh?: number | null;
          diesel_rate_rs_per_liter?: number | null;
          furnace_oil_rate_rs_per_liter?: number | null;
          brigade_rate_rs_per_kg?: number | null;
        }> = {};
        for (const eq of boilers) {
          try {
            const limit = await boilerLimitsAPI.get(eq.equipment_number);
            limitsByEq[eq.equipment_number] = {
              daily_power_limit_kw: limit.daily_power_limit_kw ?? null,
              daily_water_limit_liters: limit.daily_water_limit_liters ?? null,
              daily_chemical_limit_kg: limit.daily_chemical_limit_kg ?? null,
              daily_diesel_limit_liters: limit.daily_diesel_limit_liters ?? null,
              daily_furnace_oil_limit_liters: limit.daily_furnace_oil_limit_liters ?? null,
              daily_brigade_limit_kg: limit.daily_brigade_limit_kg ?? null,
              daily_steam_limit_kg_hr: limit.daily_steam_limit_kg_hr ?? null,
              electricity_rate_rs_per_kwh: limit.electricity_rate_rs_per_kwh ?? null,
              diesel_rate_rs_per_liter: limit.diesel_rate_rs_per_liter ?? null,
              furnace_oil_rate_rs_per_liter: limit.furnace_oil_rate_rs_per_liter ?? null,
              brigade_rate_rs_per_kg: limit.brigade_rate_rs_per_kg ?? null,
            };
          } catch {
            limitsByEq[eq.equipment_number] = {
              daily_power_limit_kw: null,
              daily_water_limit_liters: null,
              daily_chemical_limit_kg: null,
              daily_diesel_limit_liters: null,
              daily_furnace_oil_limit_liters: null,
              daily_brigade_limit_kg: null,
              daily_steam_limit_kg_hr: null,
              electricity_rate_rs_per_kwh: null,
              diesel_rate_rs_per_liter: null,
              furnace_oil_rate_rs_per_liter: null,
              brigade_rate_rs_per_kg: null,
            };
          }
        }
        setBoilerLimits(limitsByEq);
      } catch (e) {
        console.error('Failed to load boiler limits data', e);
        toast.error('Failed to load boiler equipment');
      } finally {
        setBoilerLimitsLoading(false);
      }
    };
    loadBoilerData();
  }, []);

  useEffect(() => {
    if (boilerEquipment.length > 0 && !selectedBoilerForLimits) {
      setSelectedBoilerForLimits(boilerEquipment[0].equipment_number);
    }
  }, [boilerEquipment]);

  const handleSaveChillerLimits = async (equipmentNumber: string) => {
    setChillerLimitSaving(equipmentNumber);
    try {
      const data = chillerLimits[equipmentNumber] ?? {};
      const payload = {
        daily_power_limit_kw: data.daily_power_limit_kw ?? null,
        daily_water_ct1_liters: data.daily_water_ct1_liters ?? null,
        daily_water_ct2_liters: data.daily_water_ct2_liters ?? null,
        daily_water_ct3_liters: data.daily_water_ct3_liters ?? null,
        daily_chemical_ct1_kg: data.daily_chemical_ct1_kg ?? null,
        daily_chemical_ct2_kg: data.daily_chemical_ct2_kg ?? null,
        daily_chemical_ct3_kg: data.daily_chemical_ct3_kg ?? null,
      };
      try {
        await chillerLimitsAPI.update(equipmentNumber, payload);
      } catch (err: any) {
        // API client throws enhanced error with .status (not .response.status); 404 = no limit yet, create one
        if (err?.status === 404 || err?.response?.status === 404) {
          await chillerLimitsAPI.create({ equipment_id: equipmentNumber, ...payload });
        } else {
          throw err;
        }
      }
      toast.success(`Limits saved for ${equipmentNumber}`);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save chiller limits');
    } finally {
      setChillerLimitSaving(null);
    }
  };

  const handleSaveBoilerLimits = async (equipmentNumber: string) => {
    setBoilerLimitSaving(equipmentNumber);
    try {
      const data = boilerLimits[equipmentNumber] ?? {};
      const payload = {
        daily_power_limit_kw: data.daily_power_limit_kw ?? null,
        daily_water_limit_liters: data.daily_water_limit_liters ?? null,
        daily_chemical_limit_kg: data.daily_chemical_limit_kg ?? null,
        daily_diesel_limit_liters: data.daily_diesel_limit_liters ?? null,
        daily_furnace_oil_limit_liters: data.daily_furnace_oil_limit_liters ?? null,
        daily_brigade_limit_kg: data.daily_brigade_limit_kg ?? null,
        daily_steam_limit_kg_hr: data.daily_steam_limit_kg_hr ?? null,
        electricity_rate_rs_per_kwh: data.electricity_rate_rs_per_kwh ?? null,
        diesel_rate_rs_per_liter: data.diesel_rate_rs_per_liter ?? null,
        furnace_oil_rate_rs_per_liter: data.furnace_oil_rate_rs_per_liter ?? null,
        brigade_rate_rs_per_kg: data.brigade_rate_rs_per_kg ?? null,
      };
      try {
        await boilerLimitsAPI.update(equipmentNumber, payload);
      } catch (err: any) {
        if (err?.status === 404 || err?.response?.status === 404) {
          await boilerLimitsAPI.create({ equipment_id: equipmentNumber, ...payload });
        } else {
          throw err;
        }
      }
      toast.success(`Limits saved for ${equipmentNumber}`);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save boiler limits');
    } finally {
      setBoilerLimitSaving(null);
    }
  };

  const handleSave = async () => {
    try {
      const payload: {
        auto_logout_minutes?: number;
        log_entry_interval?: LogEntryIntervalType;
        shift_duration_hours?: number;
      } = {};

      if (sessionTimeoutMinutes !== '') {
        const minutes = Number(sessionTimeoutMinutes);
        if (!Number.isFinite(minutes) || minutes <= 0) {
          toast.error('Please enter a valid session timeout (minutes).');
          return;
        }
        payload.auto_logout_minutes = minutes;
      }

      payload.log_entry_interval = logEntryInterval;
      if (logEntryInterval === 'shift') {
        if (shiftDurationHours < 1 || shiftDurationHours > 24) {
          toast.error('Shift duration must be between 1 and 24 hours.');
          return;
        }
        payload.shift_duration_hours = shiftDurationHours;
      }

      await authAPI.updateSessionSettings(payload);
      await refreshSessionSettings();
      toast.success('Settings saved successfully');
    } catch (error: any) {
      console.error('Failed to save settings:', error);
      toast.error(
        error?.message || error?.data?.detail || 'Failed to save session settings',
      );
    }
  };

  return (
    <div className="min-h-screen">
      <Header
        title="System Settings"
        subtitle="Configure system preferences and integrations"
      />

      <div className="p-6 space-y-6 max-w-4xl">
        {/* Organization Settings */}
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Organization</h3>
              <p className="text-sm text-muted-foreground">Basic organization settings</p>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Organization Name</Label>
                <Input defaultValue="Pharma Industries Ltd." />
              </div>
              <div className="space-y-2">
                <Label>Industry</Label>
                <Input defaultValue="Pharmaceutical Manufacturing" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input defaultValue="123 Industrial Park, Sector 7" />
            </div>
          </div>
        </div>

        {/* Notification Settings */}
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <Bell className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Notifications</h3>
              <p className="text-sm text-muted-foreground">Configure alert preferences</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Email Alerts</p>
                <p className="text-sm text-muted-foreground">Receive critical alerts via email</p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Calibration Reminders</p>
                <p className="text-sm text-muted-foreground">Get notified 30 days before due date</p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Approval Notifications</p>
                <p className="text-sm text-muted-foreground">Notify supervisors of pending approvals</p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Equipment Alerts</p>
                <p className="text-sm text-muted-foreground">Alerts when readings exceed limits</p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </div>

        {/* Security Settings */}
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Security</h3>
              <p className="text-sm text-muted-foreground">Access and authentication settings</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Two-Factor Authentication</p>
                <p className="text-sm text-muted-foreground">Require 2FA for all users</p>
              </div>
              <Switch />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Session Timeout</p>
                <p className="text-sm text-muted-foreground">Auto logout after inactivity</p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  className="w-20"
                  value={sessionTimeoutMinutes}
                  disabled={isSessionLoading}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '') {
                      setSessionTimeoutMinutes('');
                    } else {
                      const num = Number(value);
                      if (!Number.isNaN(num)) {
                        setSessionTimeoutMinutes(num);
                      }
                    }
                  }}
                />
                <span className="text-sm text-muted-foreground">minutes</span>
              </div>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Change password</p>
                <p className="text-sm text-muted-foreground">Update your account password</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate('/change-password')}>
                <Lock className="w-4 h-4 mr-2" />
                Change password
              </Button>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Digital Signature Verification</p>
                <p className="text-sm text-muted-foreground">Require signature for all entries</p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </div>

        {/* Data Settings */}
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <Database className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Data Management</h3>
              <p className="text-sm text-muted-foreground">Backup and retention settings</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Auto Backup</p>
                <p className="text-sm text-muted-foreground">Daily automatic backups</p>
              </div>
              <Switch defaultChecked />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Data Retention Period</p>
                <p className="text-sm text-muted-foreground">Keep records for compliance</p>
              </div>
              <Badge variant="accent">7 Years</Badge>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Last Backup</p>
                <p className="text-sm text-muted-foreground">Most recent backup status</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="success">Successful</Badge>
                <span className="text-sm text-muted-foreground">Today 02:00</span>
              </div>
            </div>
          </div>
        </div>

        {/* Chiller daily limits – per equipment (Manager/Super Admin) */}
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <Thermometer className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Chiller daily limits</h3>
              <p className="text-sm text-muted-foreground">Daily power (kWh), water (L) and chemical (kg) limits per cooling tower for each chiller. Leave blank for no limit.</p>
            </div>
          </div>
          {chillerLimitsLoading ? (
            <p className="text-sm text-muted-foreground">Loading chiller equipment…</p>
          ) : chillerEquipment.length === 0 ? (
            <p className="text-sm text-muted-foreground">No chiller equipment found. Add equipment with category Chiller in Equipment Master.</p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Select chiller</Label>
                <Select
                  value={selectedChillerForLimits || chillerEquipment[0]?.equipment_number}
                  onValueChange={setSelectedChillerForLimits}
                >
                  <SelectTrigger className="w-full max-w-sm">
                    <SelectValue placeholder="Select chiller to configure limits" />
                  </SelectTrigger>
                  <SelectContent>
                    {chillerEquipment.map((eq) => (
                      <SelectItem key={eq.id} value={eq.equipment_number}>
                        {eq.equipment_number} – {eq.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Choose one chiller to view and edit its daily limits. Save limits for the selected chiller below.</p>
              </div>
              {selectedChillerForLimits && (() => {
                const eq = chillerEquipment.find((e) => e.equipment_number === selectedChillerForLimits);
                if (!eq) return null;
                return (
                  <div className="border border-border rounded-lg p-4 space-y-4">
                    <h4 className="font-medium text-foreground">{eq.equipment_number} – {eq.name}</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs">Daily power limit (kWh)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          placeholder="No limit"
                          value={chillerLimits[eq.equipment_number]?.daily_power_limit_kw ?? ''}
                          onChange={(e) => {
                            const v = e.target.value === '' ? null : Number(e.target.value);
                            setChillerLimits((prev) => ({
                              ...prev,
                              [eq.equipment_number]: { ...(prev[eq.equipment_number] ?? {}), daily_power_limit_kw: v ?? undefined },
                            }));
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Cooling Tower 1 – Water limit (L)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          placeholder="No limit"
                          value={chillerLimits[eq.equipment_number]?.daily_water_ct1_liters ?? ''}
                          onChange={(e) => {
                            const v = e.target.value === '' ? null : Number(e.target.value);
                            setChillerLimits((prev) => ({
                              ...prev,
                              [eq.equipment_number]: { ...(prev[eq.equipment_number] ?? {}), daily_water_ct1_liters: v ?? undefined },
                            }));
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Cooling Tower 2 – Water limit (L)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          placeholder="No limit"
                          value={chillerLimits[eq.equipment_number]?.daily_water_ct2_liters ?? ''}
                          onChange={(e) => {
                            const v = e.target.value === '' ? null : Number(e.target.value);
                            setChillerLimits((prev) => ({
                              ...prev,
                              [eq.equipment_number]: { ...(prev[eq.equipment_number] ?? {}), daily_water_ct2_liters: v ?? undefined },
                            }));
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Cooling Tower 3 – Water limit (L)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          placeholder="No limit"
                          value={chillerLimits[eq.equipment_number]?.daily_water_ct3_liters ?? ''}
                          onChange={(e) => {
                            const v = e.target.value === '' ? null : Number(e.target.value);
                            setChillerLimits((prev) => ({
                              ...prev,
                              [eq.equipment_number]: { ...(prev[eq.equipment_number] ?? {}), daily_water_ct3_liters: v ?? undefined },
                            }));
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Cooling Tower Pump – Chemical limit (kg)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          placeholder="No limit"
                          value={chillerLimits[eq.equipment_number]?.daily_chemical_ct1_kg ?? ''}
                          onChange={(e) => {
                            const v = e.target.value === '' ? null : Number(e.target.value);
                            setChillerLimits((prev) => ({
                              ...prev,
                              [eq.equipment_number]: { ...(prev[eq.equipment_number] ?? {}), daily_chemical_ct1_kg: v ?? undefined },
                            }));
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Chilled Water Pump – Chemical limit (kg)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          placeholder="No limit"
                          value={chillerLimits[eq.equipment_number]?.daily_chemical_ct2_kg ?? ''}
                          onChange={(e) => {
                            const v = e.target.value === '' ? null : Number(e.target.value);
                            setChillerLimits((prev) => ({
                              ...prev,
                              [eq.equipment_number]: { ...(prev[eq.equipment_number] ?? {}), daily_chemical_ct2_kg: v ?? undefined },
                            }));
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Cooling Tower Fan – Chemical limit (kg)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          placeholder="No limit"
                          value={chillerLimits[eq.equipment_number]?.daily_chemical_ct3_kg ?? ''}
                          onChange={(e) => {
                            const v = e.target.value === '' ? null : Number(e.target.value);
                            setChillerLimits((prev) => ({
                              ...prev,
                              [eq.equipment_number]: { ...(prev[eq.equipment_number] ?? {}), daily_chemical_ct3_kg: v ?? undefined },
                            }));
                          }}
                        />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="accent"
                      disabled={chillerLimitSaving === eq.equipment_number}
                      onClick={() => handleSaveChillerLimits(eq.equipment_number)}
                    >
                      {chillerLimitSaving === eq.equipment_number ? 'Saving…' : 'Save limits'}
                    </Button>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Boiler daily limits – per equipment (Manager/Super Admin) */}
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <Flame className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Boiler daily limits</h3>
              <p className="text-sm text-muted-foreground">Daily power (kWh), water (L) and chemical (kg) limits per boiler. Leave blank for no limit.</p>
            </div>
          </div>
          {boilerLimitsLoading ? (
            <p className="text-sm text-muted-foreground">Loading boiler equipment…</p>
          ) : boilerEquipment.length === 0 ? (
            <p className="text-sm text-muted-foreground">No boiler equipment found. Add equipment with category Boiler in Equipment Master.</p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Select boiler</Label>
                <Select
                  value={selectedBoilerForLimits || boilerEquipment[0]?.equipment_number}
                  onValueChange={setSelectedBoilerForLimits}
                >
                  <SelectTrigger className="w-full max-w-sm">
                    <SelectValue placeholder="Select boiler to configure limits" />
                  </SelectTrigger>
                  <SelectContent>
                    {boilerEquipment.map((eq) => (
                      <SelectItem key={eq.id} value={eq.equipment_number}>
                        {eq.equipment_number} – {eq.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Choose one boiler to view and edit its daily limits. Save limits for the selected boiler below.</p>
              </div>
              {selectedBoilerForLimits && (() => {
                const eq = boilerEquipment.find((e) => e.equipment_number === selectedBoilerForLimits);
                if (!eq) return null;
                return (
                  <div className="border border-border rounded-lg p-4 space-y-4">
                    <h4 className="font-medium text-foreground">{eq.equipment_number} – {eq.name}</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs">Daily power limit (kWh)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          placeholder="No limit"
                          value={boilerLimits[eq.equipment_number]?.daily_power_limit_kw ?? ''}
                          onChange={(e) => {
                            const v = e.target.value === '' ? null : Number(e.target.value);
                            setBoilerLimits((prev) => ({
                              ...prev,
                              [eq.equipment_number]: { ...(prev[eq.equipment_number] ?? {}), daily_power_limit_kw: v ?? undefined },
                            }));
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Electricity rate (Rs/kWh)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          placeholder="For cost"
                          value={boilerLimits[eq.equipment_number]?.electricity_rate_rs_per_kwh ?? ''}
                          onChange={(e) => {
                            const v = e.target.value === '' ? null : Number(e.target.value);
                            setBoilerLimits((prev) => ({
                              ...prev,
                              [eq.equipment_number]: { ...(prev[eq.equipment_number] ?? {}), electricity_rate_rs_per_kwh: v ?? undefined },
                            }));
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Daily water limit (L)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          placeholder="No limit"
                          value={boilerLimits[eq.equipment_number]?.daily_water_limit_liters ?? ''}
                          onChange={(e) => {
                            const v = e.target.value === '' ? null : Number(e.target.value);
                            setBoilerLimits((prev) => ({
                              ...prev,
                              [eq.equipment_number]: { ...(prev[eq.equipment_number] ?? {}), daily_water_limit_liters: v ?? undefined },
                            }));
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Daily chemical limit (kg)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          placeholder="No limit"
                          value={boilerLimits[eq.equipment_number]?.daily_chemical_limit_kg ?? ''}
                          onChange={(e) => {
                            const v = e.target.value === '' ? null : Number(e.target.value);
                            setBoilerLimits((prev) => ({
                              ...prev,
                              [eq.equipment_number]: { ...(prev[eq.equipment_number] ?? {}), daily_chemical_limit_kg: v ?? undefined },
                            }));
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Diesel limit (L)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          placeholder="No limit"
                          value={boilerLimits[eq.equipment_number]?.daily_diesel_limit_liters ?? ''}
                          onChange={(e) => {
                            const v = e.target.value === '' ? null : Number(e.target.value);
                            setBoilerLimits((prev) => ({
                              ...prev,
                              [eq.equipment_number]: { ...(prev[eq.equipment_number] ?? {}), daily_diesel_limit_liters: v ?? undefined },
                            }));
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Diesel rate (Rs/L)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          placeholder="For cost"
                          value={boilerLimits[eq.equipment_number]?.diesel_rate_rs_per_liter ?? ''}
                          onChange={(e) => {
                            const v = e.target.value === '' ? null : Number(e.target.value);
                            setBoilerLimits((prev) => ({
                              ...prev,
                              [eq.equipment_number]: { ...(prev[eq.equipment_number] ?? {}), diesel_rate_rs_per_liter: v ?? undefined },
                            }));
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Furnace oil limit (L)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          placeholder="No limit"
                          value={boilerLimits[eq.equipment_number]?.daily_furnace_oil_limit_liters ?? ''}
                          onChange={(e) => {
                            const v = e.target.value === '' ? null : Number(e.target.value);
                            setBoilerLimits((prev) => ({
                              ...prev,
                              [eq.equipment_number]: { ...(prev[eq.equipment_number] ?? {}), daily_furnace_oil_limit_liters: v ?? undefined },
                            }));
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Furnace oil rate (Rs/L)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          placeholder="For cost"
                          value={boilerLimits[eq.equipment_number]?.furnace_oil_rate_rs_per_liter ?? ''}
                          onChange={(e) => {
                            const v = e.target.value === '' ? null : Number(e.target.value);
                            setBoilerLimits((prev) => ({
                              ...prev,
                              [eq.equipment_number]: { ...(prev[eq.equipment_number] ?? {}), furnace_oil_rate_rs_per_liter: v ?? undefined },
                            }));
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Brigade limit (kg)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          placeholder="No limit"
                          value={boilerLimits[eq.equipment_number]?.daily_brigade_limit_kg ?? ''}
                          onChange={(e) => {
                            const v = e.target.value === '' ? null : Number(e.target.value);
                            setBoilerLimits((prev) => ({
                              ...prev,
                              [eq.equipment_number]: { ...(prev[eq.equipment_number] ?? {}), daily_brigade_limit_kg: v ?? undefined },
                            }));
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Brigade rate (Rs/kg)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          placeholder="For cost"
                          value={boilerLimits[eq.equipment_number]?.brigade_rate_rs_per_kg ?? ''}
                          onChange={(e) => {
                            const v = e.target.value === '' ? null : Number(e.target.value);
                            setBoilerLimits((prev) => ({
                              ...prev,
                              [eq.equipment_number]: { ...(prev[eq.equipment_number] ?? {}), brigade_rate_rs_per_kg: v ?? undefined },
                            }));
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Steam limit (kg/hr)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="any"
                          placeholder="No limit"
                          value={boilerLimits[eq.equipment_number]?.daily_steam_limit_kg_hr ?? ''}
                          onChange={(e) => {
                            const v = e.target.value === '' ? null : Number(e.target.value);
                            setBoilerLimits((prev) => ({
                              ...prev,
                              [eq.equipment_number]: { ...(prev[eq.equipment_number] ?? {}), daily_steam_limit_kg_hr: v ?? undefined },
                            }));
                          }}
                        />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="accent"
                      disabled={boilerLimitSaving === eq.equipment_number}
                      onClick={() => handleSaveBoilerLimits(eq.equipment_number)}
                    >
                      {boilerLimitSaving === eq.equipment_number ? 'Saving…' : 'Save limits'}
                    </Button>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Log book entry interval – common for all log monitors */}
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Log Book Entry Interval</h3>
              <p className="text-sm text-muted-foreground">Configure mandatory entry schedule for all log monitors (chiller, boiler, filter, chemical, etc.)</p>
              <p className="text-xs text-muted-foreground mt-1">Used when an equipment does not have its own interval. Per-equipment intervals can be set in Equipment Master (edit equipment).</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Entry interval</Label>
              <Select
                value={logEntryInterval}
                onValueChange={(v) => setLogEntryInterval(v as LogEntryIntervalType)}
                disabled={isSessionLoading}
              >
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue placeholder="Select interval" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="shift">Shift</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {logEntryInterval === 'shift' && (
              <div className="space-y-2">
                <Label>Shift duration (hours)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={24}
                    className="w-20"
                    value={shiftDurationHours}
                    disabled={isSessionLoading}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isNaN(v)) setShiftDurationHours(Math.min(24, Math.max(1, v)));
                    }}
                  />
                  <span className="text-sm text-muted-foreground">hours</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Reset to Defaults
          </Button>
          <Button variant="accent" onClick={handleSave}>
            <Save className="w-4 h-4 mr-2" />
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
