import { Database } from './database';

export class ActivityService {
    constructor(private db: Database) { }

    /**
     * Generates a summary of actions for the last 24 hours.
     */
    async generateDailySummary(): Promise<string> {
        const activities = await this.db.getRecentActivity(24);

        if (activities.length === 0) {
            return "**Daily Progress Update**\nNo major actions were recorded in the Job Application Tracker over the last 24 hours.";
        }

        const groups: { [key: string]: any[] } = {
            job: [],
            company: [],
            contact: [],
            interaction: [],
            note: [],
            document: [],
            interview_question: [],
            reminder: []
        };

        activities.forEach(a => {
            if (groups[a.entity_type]) {
                groups[a.entity_type].push(a);
            }
        });

        let summary = "**Daily Progress Update**\nThe user accomplished the following in the last 24 hours:\n\n";

        if (groups.job.length > 0) {
            summary += `- Jobs: Created or Updated ${groups.job.length} listings.\n`;
        }
        if (groups.company.length > 0) {
            summary += `- Companies: Managed ${groups.company.length} company profiles.\n`;
        }
        if (groups.contact.length > 0) {
            summary += `- Contacts: Added or Updated ${groups.contact.length} networking contacts.\n`;
        }
        if (groups.interaction.length > 0) {
            summary += `- Interactions: Logged ${groups.interaction.length} communications.\n`;
        }
        if (groups.document.length > 0) {
            summary += `- Documents: Added or Updated ${groups.document.length} documents.\n`;
        }
        if (groups.interview_question.length > 0) {
            summary += `- Interview Prep: Added or Updated ${groups.interview_question.length} questions.\n`;
        }
        if (groups.reminder.length > 0) {
            summary += `- Reminders: Set ${groups.reminder.length} follow-ups.\n`;
        }

        summary += "\n**Detailed Timeline:**\n";
        activities.slice(0, 15).forEach(a => {
            const time = new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            summary += `* [${time}] ${a.description}\n`;
        });

        if (activities.length > 15) {
            summary += `*...and ${activities.length - 15} more actions.*`;
        }

        return summary;
    }
}
