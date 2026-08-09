/**
 * Company form — form-layout-01 structure customized for Clarity payroll
 * company party fields (code, name, statutory numbers, HRDF).
 */

import type { ComponentProps } from "react";
import FormLayout01 from "./form-layout-01";

function CompanyForm(props: ComponentProps<typeof FormLayout01>) {
  return <FormLayout01 {...props} />;
}

export default CompanyForm;
