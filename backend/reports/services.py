"""
Service helpers for report-related orchestration.
"""

from reports.utils import create_report_entry


def create_utility_report_for_log(
    *,
    log,
    source_table: str,
    title_prefix: str,
    approved_by,
    remarks: str = "",
    title_override: str | None = None,
):
    """
    Create utility report entry for approved log models.
    Keeps report payload consistent across logbook modules.
    """
    title = title_override or f"{title_prefix} - {log.equipment_id or 'N/A'}"
    return create_report_entry(
        report_type="utility",
        source_id=str(log.id),
        source_table=source_table,
        title=title,
        site=log.equipment_id or "N/A",
        created_by=log.operator_name or "Unknown",
        created_at=log.created_at,
        approved_by=approved_by,
        remarks=remarks,
    )
