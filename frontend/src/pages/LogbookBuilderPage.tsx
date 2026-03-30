import React, { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LogbookSchema, LogbookField, FieldType } from '@/types/logbook-config';
import { Plus, Trash2, GripVertical, Save, Eye, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { logbookAPI } from '@/lib/api';

export default function LogbookBuilderPage() {
  const { user } = useAuth();
  const [currentSchema, setCurrentSchema] = useState<Partial<LogbookSchema>>({
    name: '',
    description: '',
    category: '',
    fields: [],
    clientId: 'svu-enterprises',
    workflow: {
      requiresApproval: true,
      approvalRoles: ['supervisor', 'super_admin'],
    },
  });
  const [editingFieldIndex, setEditingFieldIndex] = useState<number | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [assignedRoles, setAssignedRoles] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const fieldTypes: { value: FieldType; label: string }[] = [
    { value: 'text', label: 'Text' },
    { value: 'number', label: 'Number' },
    { value: 'textarea', label: 'Textarea' },
    { value: 'select', label: 'Select (Dropdown)' },
    { value: 'date', label: 'Date' },
    { value: 'datetime', label: 'Date & Time' },
    { value: 'boolean', label: 'Boolean (Yes/No)' },
    { value: 'calculated', label: 'Calculated Field' },
  ];

  const categories = [
    { value: 'utility', label: 'Utility' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'quality', label: 'Quality Control' },
    { value: 'safety', label: 'Safety' },
    { value: 'validation', label: 'Validation' },
    { value: 'custom', label: 'Custom' },
  ];

  const addField = () => {
    const newField: LogbookField = {
      id: `field_${Date.now()}`,
      name: '',
      label: '',
      type: 'text',
      required: false,
      display: {
        order: (currentSchema.fields?.length || 0) + 1,
        group: 'General',
        columnSpan: 1,
      },
    };

    setCurrentSchema({
      ...currentSchema,
      fields: [...(currentSchema.fields || []), newField],
    });
    setEditingFieldIndex((currentSchema.fields?.length || 0));
  };

  const updateField = (index: number, updates: Partial<LogbookField>) => {
    const newFields = [...(currentSchema.fields || [])];
    newFields[index] = { ...newFields[index], ...updates };
    setCurrentSchema({ ...currentSchema, fields: newFields });
  };

  const removeField = (index: number) => {
    const newFields = currentSchema.fields?.filter((_, i) => i !== index) || [];
    // Reorder fields
    newFields.forEach((field, i) => {
      if (field.display) {
        field.display.order = i + 1;
      }
    });
    setCurrentSchema({ ...currentSchema, fields: newFields });
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    const newFields = [...(currentSchema.fields || [])];
    if (direction === 'up' && index > 0) {
      [newFields[index - 1], newFields[index]] = [newFields[index], newFields[index - 1]];
      newFields[index - 1].display = { ...newFields[index - 1].display, order: index };
      newFields[index].display = { ...newFields[index].display, order: index + 1 };
    } else if (direction === 'down' && index < newFields.length - 1) {
      [newFields[index], newFields[index + 1]] = [newFields[index + 1], newFields[index]];
      newFields[index].display = { ...newFields[index].display, order: index + 1 };
      newFields[index + 1].display = { ...newFields[index + 1].display, order: index + 2 };
    }
    setCurrentSchema({ ...currentSchema, fields: newFields });
  };

  const handleSave = async () => {
    if (!currentSchema.name || !currentSchema.category) {
      toast.error('Please fill in logbook name and category');
      return;
    }

    if (!currentSchema.fields || currentSchema.fields.length === 0) {
      toast.error('Please add at least one field');
      return;
    }

    if (assignedRoles.length === 0) {
      toast.error('Please assign at least one role');
      return;
    }

    // Validate fields
    for (const field of currentSchema.fields) {
      if (!field.name || !field.label) {
        toast.error(`Field "${field.label || field.name || 'Unnamed'}" is missing name or label`);
        return;
      }
    }

    setIsSaving(true);
    try {
      const schemaData = {
        name: currentSchema.name,
        description: currentSchema.description || '',
        client_id: currentSchema.clientId || 'svu-enterprises',
        category: currentSchema.category,
        fields: currentSchema.fields,
        workflow: currentSchema.workflow || {
          requiresApproval: true,
          approvalRoles: ['supervisor', 'super_admin'],
        },
        display: {
          icon: 'FileText',
          color: 'blue',
          defaultView: 'table',
        },
        metadata: currentSchema.metadata || {},
        assigned_roles: assignedRoles,
      };

      await logbookAPI.create(schemaData);
      setIsSaveDialogOpen(false);
      toast.success('Logbook schema saved successfully!');
      
      // Reset form
      setAssignedRoles([]);
      setCurrentSchema({
        name: '',
        description: '',
        category: '',
        fields: [],
        clientId: 'svu-enterprises',
        workflow: {
          requiresApproval: true,
          approvalRoles: ['supervisor', 'super_admin'],
        },
      });
      
      // Trigger a custom event to refresh logbooks page
      window.dispatchEvent(new CustomEvent('logbookSaved'));
    } catch (error: any) {
      const errorMessage = error?.response?.data?.detail || 
                          error?.response?.data?.error || 
                          error?.message || 
                          'Failed to save logbook';
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const groupedFields = () => {
    const groups: Record<string, LogbookField[]> = {};
    currentSchema.fields?.forEach(field => {
      const group = field.display?.group || 'General';
      if (!groups[group]) groups[group] = [];
      groups[group].push(field);
    });
    return groups;
  };

  return (
    <div className="min-h-screen">
      <Header
        title="Logbook Builder"
        subtitle="Create custom logbook schemas with your own fields"
      />

      <div className="p-6 space-y-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: Schema Configuration */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Info */}
            <div className="bg-card rounded-lg border p-6 space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Settings2 className="w-5 h-5" />
                Basic Information
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Logbook Name *</Label>
                  <Input
                    value={currentSchema.name || ''}
                    onChange={(e) => setCurrentSchema({ ...currentSchema, name: e.target.value })}
                    placeholder="e.g., Daily Production Log"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Select
                    value={currentSchema.category || ''}
                    onValueChange={(value) => setCurrentSchema({ ...currentSchema, category: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(cat => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={currentSchema.description || ''}
                  onChange={(e) => setCurrentSchema({ ...currentSchema, description: e.target.value })}
                  placeholder="Describe what this logbook is used for..."
                  rows={2}
                />
              </div>
            </div>

            {/* Fields Builder */}
            <div className="bg-card rounded-lg border p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Fields</h3>
                <Button onClick={addField} variant="accent">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Field
                </Button>
              </div>

              <div className="space-y-4">
                {currentSchema.fields?.map((field, index) => (
                  <div
                    key={field.id}
                    className={cn(
                      'border rounded-lg p-4 space-y-3',
                      editingFieldIndex === index && 'ring-2 ring-accent'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GripVertical className="w-4 h-4 text-muted-foreground cursor-move" />
                        <span className="text-sm font-medium">
                          Field {index + 1}: {field.label || 'Unnamed Field'}
                        </span>
                        {field.required && (
                          <Badge variant="secondary" className="text-xs">Required</Badge>
                        )}
                        {field.type === 'calculated' && (
                          <Badge variant="accent" className="text-xs">Calculated</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => moveField(index, 'up')}
                          disabled={index === 0}
                        >
                          ↑
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => moveField(index, 'down')}
                          disabled={index === (currentSchema.fields?.length || 0) - 1}
                        >
                          ↓
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingFieldIndex(editingFieldIndex === index ? null : index)}
                        >
                          <Settings2 className="w-4 h-4" />
                        </Button>
                        {user?.role === 'super_admin' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeField(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {editingFieldIndex === index && (
                      <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                        <div className="space-y-2">
                          <Label>Field Name (ID) *</Label>
                          <Input
                            value={field.name}
                            onChange={(e) => updateField(index, { name: e.target.value })}
                            placeholder="e.g., temperature"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Display Label *</Label>
                          <Input
                            value={field.label}
                            onChange={(e) => updateField(index, { label: e.target.value })}
                            placeholder="e.g., Temperature (°C)"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Field Type *</Label>
                          <Select
                            value={field.type}
                            onValueChange={(value) => updateField(index, { type: value as FieldType })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {fieldTypes.map(type => (
                                <SelectItem key={type.value} value={type.value}>
                                  {type.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Group</Label>
                          <Input
                            value={field.display?.group || 'General'}
                            onChange={(e) => updateField(index, {
                              display: { ...field.display, group: e.target.value, order: field.display?.order || index + 1 }
                            })}
                            placeholder="e.g., Temperature Readings"
                          />
                        </div>
                        {field.type === 'select' && (
                          <div className="space-y-2 col-span-2">
                            <Label>Options (comma-separated)</Label>
                            <Input
                              value={field.options?.join(', ') || ''}
                              onChange={(e) => updateField(index, {
                                options: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                              })}
                              placeholder="Option 1, Option 2, Option 3"
                            />
                          </div>
                        )}
                        {field.type === 'number' && (
                          <>
                            <div className="space-y-2">
                              <Label>Min Value</Label>
                              <Input
                                type="number"
                                value={field.validation?.min || ''}
                                onChange={(e) => updateField(index, {
                                  validation: {
                                    ...field.validation,
                                    min: e.target.value ? parseFloat(e.target.value) : undefined
                                  }
                                })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Max Value</Label>
                              <Input
                                type="number"
                                value={field.validation?.max || ''}
                                onChange={(e) => updateField(index, {
                                  validation: {
                                    ...field.validation,
                                    max: e.target.value ? parseFloat(e.target.value) : undefined
                                  }
                                })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Limit Type</Label>
                              <Select
                                value={field.metadata?.limit?.type || ''}
                                onValueChange={(value) => {
                                  const limit = field.metadata?.limit;
                                  updateField(index, {
                                    metadata: {
                                      ...field.metadata,
                                      limit: limit ? { ...limit, type: value as 'min' | 'max' } : undefined
                                    }
                                  });
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select limit type" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="max">NMT (Not More Than)</SelectItem>
                                  <SelectItem value="min">NLT (Not Less Than)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Limit Value</Label>
                              <Input
                                type="number"
                                value={field.metadata?.limit?.value || ''}
                                onChange={(e) => {
                                  const limit = field.metadata?.limit;
                                  updateField(index, {
                                    metadata: {
                                      ...field.metadata,
                                      limit: limit ? {
                                        ...limit,
                                        value: e.target.value ? parseFloat(e.target.value) : 0
                                      } : {
                                        type: 'max',
                                        value: e.target.value ? parseFloat(e.target.value) : 0,
                                        unit: '',
                                        condition: 'NMT'
                                      }
                                    }
                                  });
                                }}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Limit Unit</Label>
                              <Input
                                value={field.metadata?.limit?.unit || ''}
                                onChange={(e) => {
                                  const limit = field.metadata?.limit;
                                  updateField(index, {
                                    metadata: {
                                      ...field.metadata,
                                      limit: limit ? { ...limit, unit: e.target.value } : undefined
                                    }
                                  });
                                }}
                                placeholder="e.g., °C, bar, LPH"
                              />
                            </div>
                          </>
                        )}
                        {field.type === 'calculated' && (
                          <div className="space-y-2 col-span-2">
                            <Label>Formula</Label>
                            <Input
                              value={field.calculation?.formula || ''}
                              onChange={(e) => updateField(index, {
                                calculation: {
                                  ...field.calculation,
                                  formula: e.target.value,
                                  dependsOn: field.calculation?.dependsOn || []
                                }
                              })}
                              placeholder="e.g., (field1 + field2) / 2"
                            />
                            <p className="text-xs text-muted-foreground">
                              Use field IDs or names in the formula. Example: (velocity_1 + velocity_2) / 2
                            </p>
                          </div>
                        )}
                        <div className="flex items-center gap-4 col-span-2">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={field.required || false}
                              onChange={(e) => updateField(index, { required: e.target.checked })}
                            />
                            <span className="text-sm">Required Field</span>
                          </label>
                          <div className="flex items-center gap-2">
                            <Label className="text-sm">Column Span:</Label>
                            <Select
                              value={(field.display?.columnSpan || 1).toString()}
                              onValueChange={(value) => updateField(index, {
                                display: { ...field.display, columnSpan: parseInt(value) }
                              })}
                            >
                              <SelectTrigger className="w-20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">1</SelectItem>
                                <SelectItem value="2">2</SelectItem>
                                <SelectItem value="3">3</SelectItem>
                                <SelectItem value="4">4</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {(!currentSchema.fields || currentSchema.fields.length === 0) && (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No fields added yet. Click "Add Field" to get started.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Preview & Actions */}
          <div className="space-y-6">
            <div className="bg-card rounded-lg border p-6 space-y-4 sticky top-6">
              <h3 className="font-semibold">Preview & Actions</h3>
              
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  <strong>Fields:</strong> {currentSchema.fields?.length || 0}
                </p>
                <p className="text-sm text-muted-foreground">
                  <strong>Groups:</strong> {Object.keys(groupedFields()).length}
                </p>
              </div>

              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setIsPreviewOpen(true)}
                  disabled={!currentSchema.fields || currentSchema.fields.length === 0}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Preview Form
                </Button>
                <Button
                  variant="accent"
                  className="w-full"
                  onClick={() => setIsSaveDialogOpen(true)}
                  disabled={!currentSchema.name || !currentSchema.category || !currentSchema.fields || currentSchema.fields.length === 0}
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Schema
                </Button>
              </div>

              {Object.keys(groupedFields()).length > 0 && (
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium mb-2">Field Groups:</p>
                  <div className="space-y-1">
                    {Object.entries(groupedFields()).map(([group, fields]) => (
                      <div key={group} className="text-xs text-muted-foreground">
                        <strong>{group}:</strong> {fields.length} field(s)
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview: {currentSchema.name || 'Untitled Logbook'}</DialogTitle>
          </DialogHeader>
          {currentSchema.fields && currentSchema.fields.length > 0 ? (
            <div className="space-y-4">
              {Object.entries(groupedFields()).map(([groupName, fields]) => (
                <div key={groupName} className="space-y-4">
                  <h3 className="text-lg font-semibold border-b pb-2">{groupName}</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {fields.map(field => (
                      <div key={field.id} className="space-y-2">
                        <Label>
                          {field.label}
                          {field.required && <span className="text-destructive ml-1">*</span>}
                        </Label>
                        <div className="h-10 bg-muted rounded-md flex items-center px-3 text-sm text-muted-foreground">
                          {field.type === 'calculated' ? '[Calculated]' : `[${field.type}]`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">Add fields to see preview</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Save Confirmation Dialog */}
      <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Logbook Schema</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to save this logbook schema? It will be available for creating entries.
            </p>
            <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
              <p><strong>Name:</strong> {currentSchema.name}</p>
              <p><strong>Category:</strong> {currentSchema.category}</p>
              <p><strong>Fields:</strong> {currentSchema.fields?.length || 0}</p>
            </div>
            
            {/* Role Assignment Section */}
            <div className="space-y-2">
              <Label>Assign to Roles *</Label>
              <p className="text-xs text-muted-foreground">
                Select which roles can access this logbook
              </p>
              <div className="space-y-2 border rounded-lg p-3">
                {(['operator', 'supervisor', 'admin', 'manager', 'super_admin'] as const).map((role) => {
                  const label =
                    role === 'super_admin'
                      ? 'Super Admin'
                      : role === 'admin'
                        ? 'Admin'
                        : role === 'manager'
                          ? 'Manager'
                          : role.charAt(0).toUpperCase() + role.slice(1);
                  return (
                  <label key={role} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={assignedRoles.includes(role)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setAssignedRoles([...assignedRoles, role]);
                        } else {
                          setAssignedRoles(assignedRoles.filter(r => r !== role));
                        }
                      }}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                  );
                })}
              </div>
              {assignedRoles.length === 0 && (
                <p className="text-xs text-destructive">
                  Please assign at least one role
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setIsSaveDialogOpen(false);
                  setAssignedRoles([]);
                }}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button 
                variant="accent" 
                onClick={handleSave}
                disabled={isSaving || assignedRoles.length === 0}
              >
                {isSaving ? 'Saving...' : 'Save Schema'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

