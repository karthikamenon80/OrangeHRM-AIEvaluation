# Proposal: Leave Balance Validation

Leave balance math is where quiet bugs hide: zero balances, negative
entitlements, over-allocation, and inverted date ranges rarely get exercised
by happy-path manual testing but are exactly the boundary conditions an
AI-assisted quality process should catch. We're specifying OrangeHRM's actual
observed validation and error behavior at these boundaries so there's a
concrete, testable contract — distinct from the general apply/approve flow
covered in `leave-approval-workflow`.
