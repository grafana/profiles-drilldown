---
cascade:
  FULL_PRODUCT_NAME: Grafana Profiles Drilldown
  PRODUCT_NAME: Profiles Drilldown
canonical: https://grafana.com/docs/grafana/latest/explore/simplified-exploration/profiles/
description: Learn how to use Profiles Drilldown to understand and troubleshoot
  your applications and services.
keywords:
  - Profiles Drilldown
  - Profiles
title: Profiles Drilldown
menuTitle: Profiles Drilldown
weight: 200
hero:
  title: Profiles Drilldown
  level: 1
  width: 100
  height: 100
  description: Use Profiles Drilldown to investigate and identify issues using profiling data.
cards:
  title_class: pt-0 lh-1
  items:
    - title: Concepts
      href: ./concepts/
      description: Learn the concepts you need to use profiling.
      height: 24
    - title: Get started
      href: ./get-started/
      description: How do you use profiling data to investigate an issue? Start here.
      height: 24
    - title: Determine your use case
      href: ./determine-use-case/
      description: Choose one of the two most common use cases to guide your exploration.
      height: 24
    - title: Choose a view
      href: ./choose-a-view/
      description: Which exploration type view best fits the issue you are investigating?
      height: 24
    - title: Investigate trends and spikes
      href: ./investigate/
      description: Use your profiling data to identify issues and determine the root cause.
      height: 24
    - title: Changelog
      href: https://github.com/grafana/profiles-drilldown/blob/main/CHANGELOG.md
      description: Learn about the updates, new features, and bugfixes in this version.
      height: 24
---

<!-- Use this for the product name {{< param "PRODUCT_NAME" >}} -->

# Profiles Drilldown

Profiling is a technique used in software development to measure and analyze the runtime behavior of a program.
By profiling a program, developers can identify which parts of the program consume the most resources, such as CPU time, memory, or I/O operations.
You can use this information to optimize the program, making it run faster or use fewer resources.

{{< docs/shared source="grafana" lookup="plugins/rename-note.md" version="<GRAFANA_VERSION>" >}}

Grafana Profiles Drilldown provides an intuitive interface for exploring your profile data.
Using Profiles Drilldown, you can:

- View high-level service performance: Get a high-level view of all of your services and how they're functioning
- Optimize processes: Identify processes or services that you can optimize for better performance
- Diagnose issues: Determine the root cause of an issue

{{< youtube id="x9aPw_CbIQc" >}}

## Explore

{{< card-grid key="cards" type="simple" >}}
