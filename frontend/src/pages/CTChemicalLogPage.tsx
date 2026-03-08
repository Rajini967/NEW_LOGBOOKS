import React, { useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ctChemicalLogAPI, equipmentAPI, equipmentCategoryAPI } from '@/lib/api';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface CTChemicalLogEntry {
  id: string;
  date: string;
  equipment_id: string;
  tower_slot: string;
  chemical_name: string;
  quantity_kg: number;
  batch?: string | null;
  operator_id?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

const TOWER_SLOTS = ['CT-1', 'CT-2', 'CT-3'] as const;

/** Full names matching Chiller Log Book chemical columns */
const TOWER_SLOT_LABELS: Record<string, string> = {
  'CT-1': 'Cooling Tower Pump',
  'CT-2': 'Chilled Water Pump',
  'CT-3': 'Cooling Tower Fan',
};

function getTowerSlotLabel(value: string): string {
  return TOWER_SLOT_LABELS[value] || value;
}

export default function CTChemicalLogPage() {
  const [entries, setEntries] = useState<CTChemicalLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [chillerEquipment, setChillerEquipment] = useState<{ id: string; equipment_number: string; name: string }[]>([]);
  const [filters, setFilters] = useState({
    equipment_id: '',
    date_from: '',
    date_to: '',
    tower_slot: '',
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    equipment_id: '',
    tower_slot: 'CT-1',
    chemical_name: '',
    quantity_kg: '',
    batch: '',
  });

  const loadChillerEquipment = async () => {
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
        return;
      }
      const list = (await equipmentAPI.list({ category: chillerCategoryId })) as any[];
      setChillerEquipment(
        (list || [])
          .filter((e: any) => e?.is_active !== false)
          .map((e: any) => ({ id: e.id, equipment_number: e.equipment_number || '', name: e.name || '' }))
      );
    } catch (e) {
      console.error('Failed to load chiller equipment', e);
    }
  };

  const loadEntries = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filters.equipment_id) params.equipment_id = filters.equipment_id;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      if (filters.tower_slot) params.tower_slot = filters.tower_slot;
      const data = await ctChemicalLogAPI.list(params);
      setEntries(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load CT chemical logs', e);
      toast.error('Failed to load entries');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChillerEquipment();
  }, []);

  useEffect(() => {
    loadEntries();
  }, [filters.equipment_id, filters.date_from, filters.date_to, filters.tower_slot]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      date: format(new Date(), 'yyyy-MM-dd'),
      equipment_id: chillerEquipment[0]?.equipment_number ?? '',
      tower_slot: 'CT-1',
      chemical_name: '',
      quantity_kg: '',
      batch: '',
    });
    setDialogOpen(true);
  };

  const openEdit = (row: CTChemicalLogEntry) => {
    setEditingId(row.id);
    const dateStr = typeof row.date === 'string' ? row.date.slice(0, 10) : format(new Date(row.date), 'yyyy-MM-dd');
    setForm({
      date: dateStr,
      equipment_id: row.equipment_id,
      tower_slot: row.tower_slot,
      chemical_name: row.chemical_name,
      quantity_kg: String(row.quantity_kg),
      batch: row.batch ?? '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(form.quantity_kg);
    if (!form.date || !form.equipment_id || !form.tower_slot || !form.chemical_name.trim() || Number.isNaN(qty) || qty < 0) {
      toast.error('Please fill date, equipment, tower, chemical name and a valid quantity (kg).');
      return;
    }
    try {
      const payload = {
        date: form.date,
        equipment_id: form.equipment_id,
        tower_slot: form.tower_slot,
        chemical_name: form.chemical_name.trim(),
        quantity_kg: qty,
        batch: form.batch.trim() || undefined,
      };
      if (editingId) {
        await ctChemicalLogAPI.update(editingId, payload);
        toast.success('Entry updated');
      } else {
        await ctChemicalLogAPI.create(payload);
        toast.success('Entry created');
      }
      setDialogOpen(false);
      loadEntries();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await ctChemicalLogAPI.delete(deleteId);
      toast.success('Entry deleted');
      setDeleteId(null);
      loadEntries();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete');
    }
  };

  return (
    <div className="min-h-screen">
      <Header
        title="Cooling Tower Chemical Log"
        subtitle="Separate log for cooling tower chemical entries"
      />
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Link to="/e-log-book">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to E Log Book
            </Button>
          </Link>
        </div>

        <div className="bg-card rounded-lg border border-border p-4 flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Equipment</Label>
            <Select
              value={filters.equipment_id || 'all'}
              onValueChange={(v) => setFilters((prev) => ({ ...prev, equipment_id: v === 'all' ? '' : v }))}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {chillerEquipment.map((eq) => (
                  <SelectItem key={eq.id} value={eq.equipment_number}>
                    {eq.equipment_number} – {eq.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Date from</Label>
            <Input
              type="date"
              value={filters.date_from}
              onChange={(e) => setFilters((prev) => ({ ...prev, date_from: e.target.value }))}
              className="w-[140px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Date to</Label>
            <Input
              type="date"
              value={filters.date_to}
              onChange={(e) => setFilters((prev) => ({ ...prev, date_to: e.target.value }))}
              className="w-[140px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tower</Label>
            <Select
              value={filters.tower_slot || 'all'}
              onValueChange={(v) => setFilters((prev) => ({ ...prev, tower_slot: v === 'all' ? '' : v }))}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {TOWER_SLOTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {getTowerSlotLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="accent" onClick={openCreate}>
                <Plus className="w-4 h-4 mr-2" />
                Add entry
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editingId ? 'Edit entry' : 'New entry'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Chiller equipment</Label>
                  <Select
                    value={form.equipment_id || ''}
                    onValueChange={(v) => setForm((prev) => ({ ...prev, equipment_id: v }))}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select equipment" />
                    </SelectTrigger>
                    <SelectContent>
                      {chillerEquipment.map((eq) => (
                        <SelectItem key={eq.id} value={eq.equipment_number}>
                          {eq.equipment_number} – {eq.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tower slot</Label>
                  <Select
                    value={form.tower_slot}
                    onValueChange={(v) => setForm((prev) => ({ ...prev, tower_slot: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TOWER_SLOTS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {getTowerSlotLabel(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Chemical name</Label>
                  <Input
                    value={form.chemical_name}
                    onChange={(e) => setForm((prev) => ({ ...prev, chemical_name: e.target.value }))}
                    placeholder="e.g. Biocide"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Quantity (kg)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={form.quantity_kg}
                    onChange={(e) => setForm((prev) => ({ ...prev, quantity_kg: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Batch (optional)</Label>
                  <Input
                    value={form.batch}
                    onChange={(e) => setForm((prev) => ({ ...prev, batch: e.target.value }))}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="accent">
                    {editingId ? 'Update' : 'Create'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="bg-card rounded-lg border border-border overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading…</div>
          ) : entries.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No entries found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 text-sm font-medium">Date</th>
                    <th className="text-left px-4 py-3 text-sm font-medium">Equipment</th>
                    <th className="text-left px-4 py-3 text-sm font-medium">Tower</th>
                    <th className="text-left px-4 py-3 text-sm font-medium">Chemical</th>
                    <th className="text-right px-4 py-3 text-sm font-medium">Qty (kg)</th>
                    <th className="text-left px-4 py-3 text-sm font-medium">Batch</th>
                    <th className="text-left px-4 py-3 text-sm font-medium">Status</th>
                    <th className="text-right px-4 py-3 text-sm font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((row) => (
                    <tr key={row.id} className="border-b border-border hover:bg-muted/20">
                      <td className="px-4 py-3 text-sm">{row.date}</td>
                      <td className="px-4 py-3 text-sm font-mono">{row.equipment_id}</td>
                      <td className="px-4 py-3 text-sm">{getTowerSlotLabel(row.tower_slot)}</td>
                      <td className="px-4 py-3 text-sm">{row.chemical_name}</td>
                      <td className="px-4 py-3 text-sm text-right">{row.quantity_kg}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{row.batch ?? '–'}</td>
                      <td className="px-4 py-3">
                        <Badge variant={row.status === 'approved' ? 'success' : 'outline'}>{row.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => setDeleteId(row.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete entry</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
