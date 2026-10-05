---
wave: 1
feature: lead-qualification
name: Lead qualification
screens:
  about-you: { title: About you, route: /start, access: public, entry: the website's Start a project button }
  your-project: { title: Your project, route: /start/project, access: public }
  budget-and-timing: { title: Budget and timing, route: /start/budget, access: public }
  qualified: { title: You're qualified, route: /start/qualified, access: public }
fields:
  lead/name: { type: string, validate: required, label: Full name, sample: Maya Okafor }
  lead/email: { type: email, validate: "required; pattern:email", label: Work email, sample: maya@northwind.io }
  lead/company: { type: string, validate: required, label: Company, sample: Northwind }
  lead/website: { type: string, validate: "optional; pattern:domain", label: Website, default: guessed from the email domain, sample: northwind.io }
  lead/role:
    type: enum
    validate: required
    options: [Founder / CEO, Marketing, Product, Engineering, Other]
    default: none
    label: Your role
    sample: Founder / CEO
  lead/roleOther: { type: string, validate: required, visible-if: lead/role == Other, label: Your role (other) }
  lead/scope: { type: "list<enum>", validate: required, options: [Brand identity, Marketing website, Product design, Development, Design system, Not sure yet], default: none, sample: [Brand identity, Marketing website] }
  lead/stage: { type: enum, validate: required, options: [Just an idea, Scoped, In progress, Live], default: none, sample: Scoped }
  lead/budget: { type: enum, validate: required, options: [Under $25k, $25–50k, $50–100k, $100–250k, $250k+], default: none, sample: $50–100k }
  lead/currency: { type: enum, options: [USD, EUR, GBP], default: USD, sample: EUR }
  lead/start: { type: enum, validate: required, options: [Within a month, 1–3 months, 3–6 months, Flexible], default: none, sample: 1–3 months }
  lead/companySize: { type: enum, validate: optional, options: [Just me, 2–10, 11–50, 51–200, "201–1,000", "1,000+"], default: none, label: How big is your team?, sample: 11–50 }
data:
  lead/firstName: { type: string, source: the lead saved on step 1, description: The first word of the full name }
  lead/recap: { type: object, source: the lead saved so far, description: Scope, budget and start for the recap }
actions:
  lead/save-about:
    screen: about-you
    trigger: submit
    effect: api/leads/save
    to: screen:your-project
    failure: node:about-you/error-count
  lead/save-project:
    screen: your-project
    trigger: submit
    effect: api/leads/save
    to: screen:budget-and-timing
    failure: node:your-project/error-count
  lead/qualify:
    screen: budget-and-timing
    trigger: submit
    effect: api/leads/qualify
    to: screen:qualified
    failure: node:budget-and-timing/error-count
  lead/book-call:
    screen: qualified
    trigger: click
    effect: none
    to: url:https://cal.com/keel/30min
  lead/back:
    trigger: click
    effect: none
    to: back
---

# Lead qualification

## Goal

A potential client answers a few questions in about 2 minutes. If they're a fit, they get a clear next step: book a 30-minute call with a partner.

## Flow

Three steps, then a result: About you, Your project, Budget and timing, Qualified.

## Rules

A personal email gets a soft amber warning. Guess the website from the email domain. Default the currency to USD. Only ask what changes our reply.

## Outcomes

Qualified leads see a personalised line, a recap (scope, budget, start), "Book a 30-min call", "Back to website", and three "What happens next" steps.

