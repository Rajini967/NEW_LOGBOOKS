import React, { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LogbookSchema, LogbookField } from '@/types/logbook-config';
import { FieldWithValidation } from './FieldWithValidation';
import { Button } from '@/components/ui/button';
import { calculateFormula, formatCalculatedValue } from '@/lib/formula-calculator';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';

interface DynamicFormProps {
  schema: LogbookSchema;
  onSubmit: (data: Record<string, any>) => void;
  defaultValues?: Record<string, any>;
  onCancel?: () => void;
}

export function DynamicForm({ schema, onSubmit, defaultValues, onCancel }: DynamicFormProps) {
  const { user } = useAuth();

  // Generate Zod schema from field definitions
  const generateZodSchema = (fields: LogbookField[]) => {
    const shape: Record<string, z.ZodTypeAny> = {};
    
    fields.forEach(field => {
      if (field.type === 'calculated') {
        // Calculated fields don't need validation
        return;
      }

      let fieldSchema: z.ZodTypeAny;
      
      switch (field.type) {
        case 'number': {
          // Create base number schema with min/max
          let baseNumberSchema = z.number({
            invalid_type_error: `${field.label} must be a number`,
            required_error: `${field.label} is required`
          });
          
          if (field.validation?.min !== undefined) {
            baseNumberSchema = baseNumberSchema.min(field.validation.min, {
              message: field.validation.customMessage || `Minimum value is ${field.validation.min}`
            });
          }
          if (field.validation?.max !== undefined) {
            baseNumberSchema = baseNumberSchema.max(field.validation.max, {
              message: field.validation.customMessage || `Maximum value is ${field.validation.max}`
            });
          }
          
          // Wrap in preprocess to handle empty strings and convert to number
          fieldSchema = z.preprocess(
            (val) => {
              // For optional fields, return undefined for empty values
              if (val === '' || val === null || val === undefined) {
                return undefined;
              }
              const num = typeof val === 'string' ? parseFloat(val) : Number(val);
              // Return undefined for NaN (invalid numbers) only if field is optional
              return isNaN(num) ? (field.required ? undefined : undefined) : num;
            },
            baseNumberSchema
          );
          
          // Make optional if not required
          if (!field.required) {
            fieldSchema = fieldSchema.optional();
          }
          break;
        }
        case 'boolean':
          fieldSchema = z.boolean();
          break;
        case 'date':
        case 'datetime':
          fieldSchema = z.date().or(z.string());
          break;
        default: {
          let stringSchema = z.string();
          if (field.validation?.pattern) {
            stringSchema = stringSchema.regex(new RegExp(field.validation.pattern), {
              message: field.validation.customMessage || 'Invalid format'
            });
          }
          fieldSchema = stringSchema;
          break;
        }
      }
      
      if (!field.required && field.type !== 'number') {
        // Number fields are already handled in their case block
        fieldSchema = fieldSchema.optional();
      }
      
      shape[field.id] = fieldSchema;
    });
    
    return z.object(shape);
  };

  const zodSchema = generateZodSchema(schema.fields);
  
  // Prepare default values
  const formDefaultValues = useMemo(() => {
    const values: Record<string, any> = {};
    
    schema.fields.forEach(field => {
      if (field.defaultValue === 'auto') {
        if (field.id === 'date' || field.name === 'date') {
          values[field.id] = format(new Date(), 'yyyy-MM-dd');
        } else if (field.id === 'time' || field.name === 'time') {
          values[field.id] = format(new Date(), "yyyy-MM-dd'T'HH:mm");
        } else if (field.id.includes('checked_by') || field.id.includes('operator') || field.id.includes('prepared_by')) {
          values[field.id] = user?.name || '';
        }
      } else if (field.defaultValue !== undefined) {
        values[field.id] = field.defaultValue;
      }
    });

    return { ...values, ...defaultValues };
  }, [schema.fields, defaultValues, user]);

  const form = useForm({
    resolver: zodResolver(zodSchema),
    defaultValues: formDefaultValues,
  });

  // Watch all field values for calculated fields
  const watchedValues = form.watch();

  // Calculate calculated fields
  useEffect(() => {
    schema.fields.forEach(field => {
      if (field.type === 'calculated' && field.calculation) {
        const fieldNameMap = schema.fields.reduce((acc, f) => {
          acc[f.id] = f.name;
          return acc;
        }, {} as Record<string, string>);

        const calculatedValue = calculateFormula(
          field.calculation.formula,
          watchedValues,
          fieldNameMap
        );

        if (calculatedValue !== null) {
          let formatted: string;
          if (typeof calculatedValue === 'number') {
            formatted = formatCalculatedValue(calculatedValue, field.metadata?.decimalPlaces);
          } else {
            formatted = calculatedValue.toString();
          }
          form.setValue(field.id, formatted, { shouldValidate: false });
        } else {
          form.setValue(field.id, '', { shouldValidate: false });
        }
      }
    });
  }, [watchedValues, schema.fields, form]);

  const handleSubmit = form.handleSubmit((data) => {
    // Process data before submission
    const processedData: Record<string, any> = {};
    
    schema.fields.forEach(field => {
      const value = data[field.id];
      
      if (field.type === 'number' && value !== undefined && value !== null && value !== '') {
        processedData[field.id] = parseFloat(value);
      } else if (field.type === 'date' && value) {
        processedData[field.id] = value instanceof Date ? value : new Date(value);
      } else {
        processedData[field.id] = value;
      }
    });

    onSubmit(processedData);
  }, (errors) => {
    const firstError = Object.values(errors)[0];
    if (firstError) {
      toast.error(firstError.message as string || 'Please fix the validation errors before submitting');
    } else {
      toast.error('Please fix the validation errors before submitting');
    }
  });

  // Group fields by group name
  const groupedFields = useMemo(() => {
    const groups: Record<string, LogbookField[]> = {};
    
    schema.fields.forEach(field => {
      if (field.display?.hidden) return;
      
      const group = field.display?.group || 'General';
      if (!groups[group]) groups[group] = [];
      groups[group].push(field);
    });

    // Sort fields by display order within each group
    Object.keys(groups).forEach(group => {
      groups[group].sort((a, b) => 
        (a.display?.order || 0) - (b.display?.order || 0)
      );
    });

    return groups;
  }, [schema.fields]);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Digital Signature Info */}
      <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-3">
        <Clock className="w-5 h-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{format(new Date(), 'PPpp')}</p>
          <p className="text-xs text-muted-foreground">Logged by: {user?.name || 'Unknown'}</p>
        </div>
      </div>

      {/* Render fields by group */}
      {Object.entries(groupedFields).map(([groupName, fields]) => (
        <div key={groupName} className="space-y-4">
          {groupName !== 'General' && (
            <h3 className="text-lg font-semibold text-foreground border-b pb-2">
              {groupName}
            </h3>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fields.map(field => {
              const fieldValue = watchedValues[field.id];
              const fieldError = form.formState.errors[field.id];

              return (
                <FieldWithValidation
                  key={field.id}
                  field={field}
                  value={fieldValue}
                  onChange={(value) => {
                    // For number fields, convert empty string to undefined for optional fields
                    if (field.type === 'number' && value === '' && !field.required) {
                      form.setValue(field.id, undefined, { shouldValidate: true });
                    } else {
                      form.setValue(field.id, value, { shouldValidate: true });
                    }
                  }}
                  error={fieldError?.message as string}
                />
              );
            })}
          </div>
        </div>
      ))}

      {/* Form Actions */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="accent">
          Save Entry
        </Button>
      </div>
    </form>
  );
}

