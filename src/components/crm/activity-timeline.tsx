import Link from "next/link";
import type { CrmActivity } from "@/lib/crm/types";

export type ActivityTimelineLink = {
  label: string;
  value: string;
  href?: string;
};

const activityTypeLabels: Record<CrmActivity["type"], string> = {
  note: "Заметка",
  call: "Звонок",
  meeting: "Встреча",
  email: "Письмо",
  other: "Другое",
};

export function getActivityTypeLabel(type: CrmActivity["type"]): string {
  return activityTypeLabels[type];
}

export function formatActivityOccurredAt(value: string): string {
  return `${new Date(value).toLocaleString("ru-RU", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  })} UTC`;
}

export function ActivityTimeline({
  activities,
  getLinks,
}: {
  activities: CrmActivity[];
  getLinks?: (activity: CrmActivity) => ActivityTimelineLink[];
}) {
  if (activities.length === 0) {
    return (
      <div className="crm-empty-state">
        <h3>Активностей пока нет</h3>
        <p>Добавьте заметку, звонок или встречу, чтобы сохранить историю взаимодействий.</p>
      </div>
    );
  }

  return (
    <div className="crm-record-list" aria-label="История активностей">
      {activities.map((activity) => (
        <article className="crm-record" key={activity.id}>
          <div className="crm-record-main">
            <div className="crm-title-row">
              <h3>{activity.subject || getActivityTypeLabel(activity.type)}</h3>
              <span className="badge">{getActivityTypeLabel(activity.type)}</span>
            </div>
            <time className="table-secondary" dateTime={activity.occurred_at}>
              {formatActivityOccurredAt(activity.occurred_at)}
            </time>
            {activity.body ? <p className="crm-record-body">{activity.body}</p> : null}
            {getLinks ? (
              <div className="crm-record-details">
                {getLinks(activity).map((link) => (
                  <span key={`${link.label}-${link.value}`}>
                    {link.label}: {link.href ? <Link className="crm-text-link" href={link.href}>{link.value}</Link> : link.value}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
