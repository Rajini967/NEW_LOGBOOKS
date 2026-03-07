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
} from 'lucide-react';
import { toast } from 'sonner';
import { authAPI } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import type { LogEntryIntervalType } from '@/types';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { refreshSessionSettings } = useAuth();
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState<number | ''>('');
  const [logEntryInterval, setLogEntryInterval] = useState<LogEntryIntervalType>('hourly');
  const [shiftDurationHours, setShiftDurationHours] = useState<number>(8);
  const [isSessionLoading, setIsSessionLoading] = useState(false);

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

        {/* Log book entry interval – common for all log monitors */}
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Log Book Entry Interval</h3>
              <p className="text-sm text-muted-foreground">Configure mandatory entry schedule for all log monitors (chiller, boiler, filter, chemical, etc.)</p>
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
