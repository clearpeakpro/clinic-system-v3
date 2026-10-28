// Componentes compartidos de Clinic System (T-005). Los tokens se importan
// aparte: `@import '@clinic/ui/tokens.css'`.

export { cn } from './cn.ts';
export { copyText } from './clipboard.ts';
export { errorMessage } from './errors.ts';
export { formatDate, formatDateTime, formatMoney, formatMoneyInput, formatTime, isTodayIn, parseMoney } from './format.ts';

export { Button, type ButtonProps } from './components/button.tsx';
export {
  RouteBadge,
  SEMANTIC_TONES,
  SemanticChip,
  StatusChip,
  VISIT_ROUTE_ICONS,
  VISIT_STATUS_STYLE,
  VisitStatusChip,
  type StatusTone,
} from './components/chips.tsx';
export { CodeField, CodeText, DateTimeText, MoneyField, MoneyText } from './components/data.tsx';
export { ConfirmDialog, DiscardChangesDialog, type ConfirmDialogProps } from './components/dialogs.tsx';
export { Banner, Field } from './components/field.tsx';
export { OTP_LENGTH, OtpInput, totpSecondsLeft } from './components/otp-input.tsx';
export {
  Checkbox,
  Dialog,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownSeparator,
  DropdownTrigger,
  Sheet,
  SheetClose,
  type DialogProps,
} from './components/overlay.tsx';
export { AsyncView, EmptyState, ErrorState, RefreshBar, SkeletonRows, Spinner, StaleDataBanner, type AsyncSource } from './components/states.tsx';
export { DataTable, type Column } from './components/table.tsx';
