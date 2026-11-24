import {
  Badge,
  Box,
  Button,
  Divider,
  FormControl,
  FormLabel,
  Grid,
  GridItem,
  HStack,
  Heading,
  Input,
  Select,
  SimpleGrid,
  Stack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Table,
  TableContainer,
  Tabs,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useToast,
} from '@chakra-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { QueryState } from '../components/PageState';
import { ApiError, api } from '../lib/api';
import {
  formatDateTime,
  formatHours,
  formatNprPaisa,
  hoursToHundredths,
  paisaToNprInput,
  parseNprToPaisa,
} from '../lib/format';
import { useRole } from '../lib/role';
import type {
  Advance,
  AdvanceLedger,
  Allowance,
  AllowanceType,
  Employee,
  EmployeePayslipListItem,
  Overtime,
  Period,
  Reimbursement,
  SecretComponent,
} from '../lib/types';

function errorMessage(error: unknown): string {
  return error instanceof ApiError || error instanceof Error ? error.message : 'Request failed.';
}

export function EmployeeDetailPage() {
  const { employeeId = '' } = useParams();
  const { role } = useRole();
  const toast = useToast();
  const queryClient = useQueryClient();
  const admin = role === 'admin';

  const employee = useQuery({
    queryKey: ['employee', employeeId],
    queryFn: () => api.get<Employee>(`/api/employees/${employeeId}`),
    enabled: employeeId.length > 0,
  });
  const periods = useQuery({ queryKey: ['periods'], queryFn: () => api.get<Period[]>('/api/periods') });
  const allowanceTypes = useQuery({
    queryKey: ['allowance-types'],
    queryFn: () => api.get<AllowanceType[]>('/api/allowance-types'),
  });
  const allowances = useQuery({
    queryKey: ['allowances', employeeId],
    queryFn: () => api.get<Allowance[]>(`/api/employees/${employeeId}/allowances`),
    enabled: employeeId.length > 0,
  });
  const reimbursements = useQuery({
    queryKey: ['reimbursements', employeeId],
    queryFn: () => api.get<Reimbursement[]>(`/api/employees/${employeeId}/reimbursements`),
    enabled: employeeId.length > 0,
  });
  const overtime = useQuery({
    queryKey: ['overtime', employeeId],
    queryFn: () => api.get<Overtime[]>(`/api/employees/${employeeId}/overtime`),
    enabled: employeeId.length > 0,
  });
  const advances = useQuery({
    queryKey: ['advances', employeeId],
    queryFn: () => api.get<Advance[]>(`/api/employees/${employeeId}/advances`),
    enabled: employeeId.length > 0,
  });
  const payslips = useQuery({
    queryKey: ['employee-payslips', employeeId],
    queryFn: () => api.get<EmployeePayslipListItem[]>(`/api/employees/${employeeId}/payslips`),
    enabled: employeeId.length > 0,
  });
  const secrets = useQuery({
    queryKey: ['secret-components', employeeId],
    queryFn: () => api.get<SecretComponent[]>(`/api/admin/employees/${employeeId}/secret-components`),
    enabled: admin && employeeId.length > 0,
  });

  const [profile, setProfile] = useState({ basic: '', designation: '', status: 'ACTIVE' });
  useEffect(() => {
    if (employee.data) {
      setProfile({
        basic: paisaToNprInput(employee.data.basicPaisa),
        designation: employee.data.designation,
        status: employee.data.status,
      });
    }
  }, [employee.data]);

  const updateProfile = useMutation({
    mutationFn: () => {
      const basicPaisa = parseNprToPaisa(profile.basic);
      if (basicPaisa === null) throw new Error('Basic pay must be a rupee amount.');
      return api.patch<Employee>(`/api/employees/${employeeId}`, {
        basicPaisa,
        designation: profile.designation,
        status: profile.status,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['employee', employeeId] });
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast({ title: 'Employee updated', status: 'success' });
    },
    onError: (error) => toast({ title: errorMessage(error), status: 'error' }),
  });

  const deactivate = useMutation({
    mutationFn: () => api.delete<Employee>(`/api/employees/${employeeId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['employee', employeeId] });
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast({ title: 'Employee deactivated (soft delete)', status: 'success' });
    },
    onError: (error) => toast({ title: errorMessage(error), status: 'error' }),
  });

  return (
    <QueryState isLoading={employee.isLoading} error={employee.error}>
      {employee.data && (
        <Box>
          <HStack justify="space-between" align="flex-start" mb={6}>
            <Box>
              <HStack>
                <Heading size="lg">{employee.data.fullName}</Heading>
                <Badge colorScheme={employee.data.status === 'ACTIVE' ? 'green' : 'red'}>
                  {employee.data.status}
                </Badge>
              </HStack>
              <Text color="gray.600">
                {employee.data.code} · {employee.data.designation} · {employee.data.department}
              </Text>
            </Box>
            <Box textAlign="right">
              <Badge colorScheme={employee.data.employmentType === 'SSF' ? 'blue' : 'gray'}>
                {employee.data.employmentType}
              </Badge>
              <Text fontSize="sm" color="gray.500">
                Joined {employee.data.joiningDate}
              </Text>
            </Box>
          </HStack>

          <Tabs colorScheme="brand" variant="enclosed">
            <TabList flexWrap="wrap">
              <Tab>Profile</Tab>
              <Tab>Pay items</Tab>
              <Tab>Advances</Tab>
              <Tab>Payslips</Tab>
              {admin && <Tab color="purple.600">Admin: secret</Tab>}
            </TabList>
            <TabPanels>
              <TabPanel px={0}>
                <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
                  <Box bg="white" p={5} borderRadius="lg" boxShadow="sm">
                    <Heading size="sm" mb={4}>
                      Employment & bank
                    </Heading>
                    <Grid templateColumns="150px 1fr" gap={2} fontSize="sm">
                      <GridItem color="gray.500">SSF number</GridItem>
                      <GridItem>{employee.data.ssfNumber ?? '—'}</GridItem>
                      <GridItem color="gray.500">Joining date</GridItem>
                      <GridItem>{employee.data.joiningDate}</GridItem>
                      <GridItem color="gray.500">Security fund</GridItem>
                      <GridItem>
                        {employee.data.securityFundEnabled ? 'Enabled (1% of basic)' : 'Disabled'}
                      </GridItem>
                      <GridItem color="gray.500">Bank</GridItem>
                      <GridItem>{employee.data.bankName}</GridItem>
                      <GridItem color="gray.500">Account name</GridItem>
                      <GridItem>{employee.data.bankAccountName}</GridItem>
                      <GridItem color="gray.500">Account number</GridItem>
                      <GridItem fontFamily="mono">{employee.data.bankAccountNumber}</GridItem>
                      <GridItem color="gray.500">Branch</GridItem>
                      <GridItem>{employee.data.bankBranch}</GridItem>
                    </Grid>
                  </Box>

                  <Box bg="white" p={5} borderRadius="lg" boxShadow="sm">
                    <Heading size="sm" mb={4}>
                      Current position
                    </Heading>
                    {admin ? (
                      <Stack spacing={4}>
                        <FormControl>
                          <FormLabel>Designation</FormLabel>
                          <Input
                            value={profile.designation}
                            onChange={(event) =>
                              setProfile({ ...profile, designation: event.target.value })
                            }
                          />
                        </FormControl>
                        <FormControl>
                          <FormLabel>Basic pay (NPR/month)</FormLabel>
                          <Input
                            value={profile.basic}
                            onChange={(event) => setProfile({ ...profile, basic: event.target.value })}
                          />
                        </FormControl>
                        <FormControl>
                          <FormLabel>Status</FormLabel>
                          <Select
                            value={profile.status}
                            onChange={(event) => setProfile({ ...profile, status: event.target.value })}
                          >
                            <option value="ACTIVE">ACTIVE</option>
                            <option value="INACTIVE">INACTIVE</option>
                          </Select>
                        </FormControl>
                        <HStack>
                          <Button
                            colorScheme="brand"
                            size="sm"
                            isLoading={updateProfile.isPending}
                            onClick={() => updateProfile.mutate()}
                          >
                            Save changes
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            colorScheme="red"
                            isLoading={deactivate.isPending}
                            onClick={() => deactivate.mutate()}
                          >
                            Deactivate
                          </Button>
                        </HStack>
                      </Stack>
                    ) : (
                      <Text fontSize="sm" color="gray.600">
                        Basic pay and personal details are visible, but only an admin can change
                        them.
                      </Text>
                    )}
                  </Box>
                </SimpleGrid>
              </TabPanel>

              <TabPanel px={0}>
                <PayItemsTab
                  employeeId={employeeId}
                  admin={admin}
                  periods={periods.data ?? []}
                  allowanceTypes={allowanceTypes.data ?? []}
                  allowances={allowances}
                  reimbursements={reimbursements}
                  overtime={overtime}
                />
              </TabPanel>

              <TabPanel px={0}>
                <AdvancesTab employeeId={employeeId} admin={admin} advances={advances} />
              </TabPanel>

              <TabPanel px={0}>
                <QueryState isLoading={payslips.isLoading} error={payslips.error}>
                  <TableContainer bg="white" borderRadius="lg" boxShadow="sm">
                    <Table size="sm">
                      <Thead bg="gray.50">
                        <Tr>
                          <Th>Period</Th>
                          <Th>Status</Th>
                          <Th isNumeric>Gross</Th>
                          <Th isNumeric>Deductions</Th>
                          <Th isNumeric>Net</Th>
                          <Th></Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {(payslips.data ?? []).map((payslip) => (
                          <Tr key={payslip.id}>
                            <Td>{payslip.periodLabel}</Td>
                            <Td>
                              <Badge colorScheme={payslip.runStatus === 'FINALIZED' ? 'green' : 'orange'}>
                                {payslip.runStatus}
                              </Badge>
                            </Td>
                            <Td isNumeric>{formatNprPaisa(payslip.grossPaisa)}</Td>
                            <Td isNumeric>{formatNprPaisa(payslip.totalDeductionsPaisa)}</Td>
                            <Td isNumeric>{formatNprPaisa(payslip.netPaisa)}</Td>
                            <Td>
                              <Button
                                as={RouterLink}
                                to={`/payslips/${payslip.id}`}
                                size="xs"
                                variant="outline"
                              >
                                View
                              </Button>
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </TableContainer>
                  {(payslips.data ?? []).length === 0 && (
                    <Text mt={4} color="gray.500">
                      No payslips yet. An admin must run a payroll period that includes this employee.
                    </Text>
                  )}
                </QueryState>
              </TabPanel>

              {admin && (
                <TabPanel px={0}>
                  <SecretTab
                    employeeId={employeeId}
                    periods={periods.data ?? []}
                    secrets={secrets}
                  />
                </TabPanel>
              )}
            </TabPanels>
          </Tabs>
        </Box>
      )}
    </QueryState>
  );
}

function PayItemsTab({
  employeeId,
  admin,
  periods,
  allowanceTypes,
  allowances,
  reimbursements,
  overtime,
}: {
  employeeId: string;
  admin: boolean;
  periods: Period[];
  allowanceTypes: AllowanceType[];
  allowances: ReturnType<typeof useQuery<Allowance[]>>;
  reimbursements: ReturnType<typeof useQuery<Reimbursement[]>>;
  overtime: ReturnType<typeof useQuery<Overtime[]>>;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const refresh = (key: string) => {
    void queryClient.invalidateQueries({ queryKey: [key, employeeId] });
  };

  const [allowanceForm, setAllowanceForm] = useState({
    allowanceTypeId: '',
    amount: '',
    fromPeriodId: '',
  });
  const [stopPeriods, setStopPeriods] = useState<Record<string, string>>({});
  const addAllowance = useMutation({
    mutationFn: () => {
      const amountPaisa = parseNprToPaisa(allowanceForm.amount);
      if (amountPaisa === null) throw new Error('Allowance amount must be a rupee amount.');
      return api.post<Allowance>(`/api/employees/${employeeId}/allowances`, {
        allowanceTypeId: allowanceForm.allowanceTypeId,
        amountPaisa,
        fromPeriodId: allowanceForm.fromPeriodId,
      });
    },
    onSuccess: () => {
      refresh('allowances');
      setAllowanceForm({ allowanceTypeId: '', amount: '', fromPeriodId: '' });
      toast({ title: 'Allowance added', status: 'success' });
    },
    onError: (error) => toast({ title: errorMessage(error), status: 'error' }),
  });
  const stopAllowance = useMutation({
    mutationFn: ({ id, stopFromPeriodId }: { id: string; stopFromPeriodId: string }) =>
      api.post<Allowance>(`/api/employee-allowances/${id}/stop`, { stopFromPeriodId }),
    onSuccess: () => {
      refresh('allowances');
      toast({ title: 'Allowance stopped', status: 'success' });
    },
    onError: (error) => toast({ title: errorMessage(error), status: 'error' }),
  });

  const [reimbForm, setReimbForm] = useState({
    kind: 'ONE_TIME',
    label: '',
    amount: '',
    periodId: '',
  });
  const addReimbursement = useMutation({
    mutationFn: () => {
      const amountPaisa = parseNprToPaisa(reimbForm.amount);
      if (amountPaisa === null) throw new Error('Reimbursement amount must be a rupee amount.');
      const payload =
        reimbForm.kind === 'ONE_TIME'
          ? {
              kind: 'ONE_TIME',
              label: reimbForm.label,
              amountPaisa,
              taxable: false,
              periodId: reimbForm.periodId,
            }
          : {
              kind: 'RECURRING',
              label: reimbForm.label,
              amountPaisa,
              taxable: false,
              fromPeriodId: reimbForm.periodId,
            };
      return api.post<Reimbursement>(`/api/employees/${employeeId}/reimbursements`, payload);
    },
    onSuccess: () => {
      refresh('reimbursements');
      setReimbForm({ kind: 'ONE_TIME', label: '', amount: '', periodId: '' });
      toast({ title: 'Reimbursement added', status: 'success' });
    },
    onError: (error) => toast({ title: errorMessage(error), status: 'error' }),
  });
  const stopReimbursement = useMutation({
    mutationFn: ({ id, stopFromPeriodId }: { id: string; stopFromPeriodId: string }) =>
      api.post<Reimbursement>(`/api/reimbursements/${id}/stop`, { stopFromPeriodId }),
    onSuccess: () => {
      refresh('reimbursements');
      toast({ title: 'Reimbursement stopped', status: 'success' });
    },
    onError: (error) => toast({ title: errorMessage(error), status: 'error' }),
  });

  const [otForm, setOtForm] = useState({ periodId: '', hours: '', note: '' });
  const saveOvertime = useMutation({
    mutationFn: () => {
      const hoursHundredths = hoursToHundredths(otForm.hours);
      if (hoursHundredths === null) throw new Error('Overtime hours must be a decimal number.');
      return api.put<Overtime>(`/api/periods/${otForm.periodId}/overtime/${employeeId}`, {
        hoursHundredths,
        multiplierOverrideBps: null,
        note: otForm.note || null,
      });
    },
    onSuccess: () => {
      refresh('overtime');
      setOtForm({ periodId: '', hours: '', note: '' });
      toast({ title: 'Overtime saved', status: 'success' });
    },
    onError: (error) => toast({ title: errorMessage(error), status: 'error' }),
  });

  return (
    <Stack spacing={6}>
      <Box bg="white" p={5} borderRadius="lg" boxShadow="sm">
        <Heading size="sm" mb={4}>
          Allowances
        </Heading>
        <QueryState isLoading={allowances.isLoading} error={allowances.error}>
          <TableContainer>
            <Table size="sm">
              <Thead bg="gray.50">
                <Tr>
                  <Th>Type</Th>
                  <Th isNumeric>Monthly</Th>
                  <Th>Taxable</Th>
                  <Th>From</Th>
                  <Th>Stopped from</Th>
                  {admin && <Th>Stop</Th>}
                </Tr>
              </Thead>
              <Tbody>
                {(allowances.data ?? []).map((allowance) => {
                  const laterPeriods = periods.filter((period) => period.seq > allowance.fromSeq);
                  return (
                    <Tr key={allowance.id}>
                      <Td>
                        {allowance.typeName}{' '}
                        {allowance.isSystem && (
                          <Badge ml={1} colorScheme="gray">
                            system
                          </Badge>
                        )}
                      </Td>
                      <Td isNumeric>{formatNprPaisa(allowance.amountPaisa)}</Td>
                      <Td>{allowance.taxable ? 'Yes' : 'No'}</Td>
                      <Td>{allowance.fromPeriodLabel}</Td>
                      <Td>{allowance.stopFromPeriodLabel ?? '—'}</Td>
                      {admin && (
                        <Td>
                          {allowance.stopFromPeriodId ? (
                            <Text color="gray.400" fontSize="xs">
                              stopped
                            </Text>
                          ) : (
                            <HStack>
                              <Select
                                size="xs"
                                maxW="140px"
                                placeholder="Period"
                                value={stopPeriods[allowance.id] ?? ''}
                                onChange={(event) =>
                                  setStopPeriods({ ...stopPeriods, [allowance.id]: event.target.value })
                                }
                              >
                                {laterPeriods.map((period) => (
                                  <option key={period.id} value={period.id}>
                                    {period.label}
                                  </option>
                                ))}
                              </Select>
                              <Button
                                size="xs"
                                variant="outline"
                                isDisabled={!stopPeriods[allowance.id]}
                                onClick={() => {
                                  const stopFromPeriodId = stopPeriods[allowance.id];
                                  if (stopFromPeriodId) {
                                    stopAllowance.mutate({ id: allowance.id, stopFromPeriodId });
                                  }
                                }}
                              >
                                Stop
                              </Button>
                            </HStack>
                          )}
                        </Td>
                      )}
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </TableContainer>
        </QueryState>

        {admin && (
          <>
            <Divider my={4} />
            <HStack align="flex-end" wrap="wrap" spacing={3}>
              <FormControl maxW="220px">
                <FormLabel fontSize="sm">Type</FormLabel>
                <Select
                  size="sm"
                  placeholder="Select type"
                  value={allowanceForm.allowanceTypeId}
                  onChange={(event) =>
                    setAllowanceForm({ ...allowanceForm, allowanceTypeId: event.target.value })
                  }
                >
                  {allowanceTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl maxW="150px">
                <FormLabel fontSize="sm">Amount (NPR)</FormLabel>
                <Input
                  size="sm"
                  value={allowanceForm.amount}
                  onChange={(event) => setAllowanceForm({ ...allowanceForm, amount: event.target.value })}
                />
              </FormControl>
              <FormControl maxW="180px">
                <FormLabel fontSize="sm">From period</FormLabel>
                <Select
                  size="sm"
                  placeholder="Period"
                  value={allowanceForm.fromPeriodId}
                  onChange={(event) =>
                    setAllowanceForm({ ...allowanceForm, fromPeriodId: event.target.value })
                  }
                >
                  {periods.map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.label}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <Button
                size="sm"
                colorScheme="brand"
                isDisabled={
                  !allowanceForm.allowanceTypeId || !allowanceForm.amount || !allowanceForm.fromPeriodId
                }
                isLoading={addAllowance.isPending}
                onClick={() => addAllowance.mutate()}
              >
                Add allowance
              </Button>
            </HStack>
          </>
        )}
      </Box>

      <Box bg="white" p={5} borderRadius="lg" boxShadow="sm">
        <Heading size="sm" mb={4}>
          Reimbursements
        </Heading>
        <QueryState isLoading={reimbursements.isLoading} error={reimbursements.error}>
          <TableContainer>
            <Table size="sm">
              <Thead bg="gray.50">
                <Tr>
                  <Th>Label</Th>
                  <Th>Kind</Th>
                  <Th isNumeric>Amount</Th>
                  <Th>Period</Th>
                  <Th>Stopped from</Th>
                  {admin && <Th>Stop</Th>}
                </Tr>
              </Thead>
              <Tbody>
                {(reimbursements.data ?? []).map((item) => (
                  <Tr key={item.id}>
                    <Td>{item.label}</Td>
                    <Td>
                      <Badge colorScheme={item.kind === 'ONE_TIME' ? 'purple' : 'teal'}>
                        {item.kind}
                      </Badge>
                    </Td>
                    <Td isNumeric>{formatNprPaisa(item.amountPaisa)}</Td>
                    <Td>{item.periodLabel ?? item.fromPeriodLabel ?? '—'}</Td>
                    <Td>{item.stopFromPeriodLabel ?? '—'}</Td>
                    {admin && (
                      <Td>
                        {item.kind === 'RECURRING' && !item.stopFromPeriodId ? (
                          <HStack>
                            <Select
                              size="xs"
                              maxW="140px"
                              placeholder="Period"
                              value={stopPeriods[item.id] ?? ''}
                              onChange={(event) =>
                                setStopPeriods({ ...stopPeriods, [item.id]: event.target.value })
                              }
                            >
                              {periods
                                .filter((period) => period.seq > (item.fromSeq ?? 0))
                                .map((period) => (
                                  <option key={period.id} value={period.id}>
                                    {period.label}
                                  </option>
                                ))}
                            </Select>
                            <Button
                              size="xs"
                              variant="outline"
                              isDisabled={!stopPeriods[item.id]}
                              onClick={() => {
                                const stopFromPeriodId = stopPeriods[item.id];
                                if (stopFromPeriodId) {
                                  stopReimbursement.mutate({ id: item.id, stopFromPeriodId });
                                }
                              }}
                            >
                              Stop
                            </Button>
                          </HStack>
                        ) : (
                          <Text fontSize="xs" color="gray.400">
                            {item.kind === 'ONE_TIME' ? 'period-bound' : 'stopped'}
                          </Text>
                        )}
                      </Td>
                    )}
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </QueryState>

        {admin && (
          <>
            <Divider my={4} />
            <HStack align="flex-end" wrap="wrap" spacing={3}>
              <FormControl maxW="150px">
                <FormLabel fontSize="sm">Kind</FormLabel>
                <Select
                  size="sm"
                  value={reimbForm.kind}
                  onChange={(event) => setReimbForm({ ...reimbForm, kind: event.target.value })}
                >
                  <option value="ONE_TIME">One time</option>
                  <option value="RECURRING">Recurring</option>
                </Select>
              </FormControl>
              <FormControl maxW="200px">
                <FormLabel fontSize="sm">Label</FormLabel>
                <Input
                  size="sm"
                  value={reimbForm.label}
                  onChange={(event) => setReimbForm({ ...reimbForm, label: event.target.value })}
                />
              </FormControl>
              <FormControl maxW="140px">
                <FormLabel fontSize="sm">Amount (NPR)</FormLabel>
                <Input
                  size="sm"
                  value={reimbForm.amount}
                  onChange={(event) => setReimbForm({ ...reimbForm, amount: event.target.value })}
                />
              </FormControl>
              <FormControl maxW="180px">
                <FormLabel fontSize="sm">Period</FormLabel>
                <Select
                  size="sm"
                  placeholder="Period"
                  value={reimbForm.periodId}
                  onChange={(event) => setReimbForm({ ...reimbForm, periodId: event.target.value })}
                >
                  {periods.map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.label}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <Button
                size="sm"
                colorScheme="brand"
                isDisabled={!reimbForm.label || !reimbForm.amount || !reimbForm.periodId}
                isLoading={addReimbursement.isPending}
                onClick={() => addReimbursement.mutate()}
              >
                Add
              </Button>
            </HStack>
          </>
        )}
      </Box>

      <Box bg="white" p={5} borderRadius="lg" boxShadow="sm">
        <Heading size="sm" mb={4}>
          Overtime
        </Heading>
        <QueryState isLoading={overtime.isLoading} error={overtime.error}>
          <TableContainer>
            <Table size="sm">
              <Thead bg="gray.50">
                <Tr>
                  <Th>Period</Th>
                  <Th isNumeric>Hours</Th>
                  <Th isNumeric>Multiplier override</Th>
                  <Th>Note</Th>
                </Tr>
              </Thead>
              <Tbody>
                {(overtime.data ?? []).map((entry) => (
                  <Tr key={entry.id}>
                    <Td>{entry.periodLabel ?? entry.periodId}</Td>
                    <Td isNumeric>{formatHours(entry.hoursHundredths)}</Td>
                    <Td isNumeric>{entry.multiplierOverrideBps ?? 'policy'}</Td>
                    <Td>{entry.note ?? '—'}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </QueryState>

        {admin && (
          <>
            <Divider my={4} />
            <HStack align="flex-end" wrap="wrap" spacing={3}>
              <FormControl maxW="180px">
                <FormLabel fontSize="sm">Period</FormLabel>
                <Select
                  size="sm"
                  placeholder="Period"
                  value={otForm.periodId}
                  onChange={(event) => setOtForm({ ...otForm, periodId: event.target.value })}
                >
                  {periods.map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.label}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl maxW="130px">
                <FormLabel fontSize="sm">Hours</FormLabel>
                <Input
                  size="sm"
                  placeholder="10.00"
                  value={otForm.hours}
                  onChange={(event) => setOtForm({ ...otForm, hours: event.target.value })}
                />
              </FormControl>
              <FormControl maxW="220px">
                <FormLabel fontSize="sm">Note</FormLabel>
                <Input
                  size="sm"
                  value={otForm.note}
                  onChange={(event) => setOtForm({ ...otForm, note: event.target.value })}
                />
              </FormControl>
              <Button
                size="sm"
                colorScheme="brand"
                isDisabled={!otForm.periodId || !otForm.hours}
                isLoading={saveOvertime.isPending}
                onClick={() => saveOvertime.mutate()}
              >
                Save overtime
              </Button>
            </HStack>
          </>
        )}
      </Box>
    </Stack>
  );
}

function AdvancesTab({
  employeeId,
  admin,
  advances,
}: {
  employeeId: string;
  admin: boolean;
  advances: ReturnType<typeof useQuery<Advance[]>>;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ principal: '', issuedOn: '2026-07-01', installment: '' });
  const [selected, setSelected] = useState<string | null>(null);
  const [installmentEdits, setInstallmentEdits] = useState<Record<string, string>>({});

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['advances', employeeId] });
    if (selected) void queryClient.invalidateQueries({ queryKey: ['advance-ledger', selected] });
  };

  const ledger = useQuery({
    queryKey: ['advance-ledger', selected],
    queryFn: () => api.get<AdvanceLedger>(`/api/advances/${selected}/ledger`),
    enabled: selected !== null,
  });

  const create = useMutation({
    mutationFn: () => {
      const principalPaisa = parseNprToPaisa(form.principal);
      const installmentPaisa = form.installment ? parseNprToPaisa(form.installment) : null;
      if (principalPaisa === null || (form.installment && installmentPaisa === null)) {
        throw new Error('Advance amounts must be rupee amounts.');
      }
      return api.post<Advance>(`/api/employees/${employeeId}/advances`, {
        principalPaisa,
        issuedOn: form.issuedOn,
        installmentPaisa,
      });
    },
    onSuccess: () => {
      refresh();
      setForm({ principal: '', issuedOn: '2026-07-01', installment: '' });
      toast({ title: 'Advance recorded', status: 'success' });
    },
    onError: (error) => toast({ title: errorMessage(error), status: 'error' }),
  });

  const updateInstallment = useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) => {
      const installmentPaisa = value ? parseNprToPaisa(value) : null;
      if (value && installmentPaisa === null) throw new Error('Installment must be a rupee amount.');
      return api.patch<Advance>(`/api/advances/${id}`, { installmentPaisa });
    },
    onSuccess: () => {
      refresh();
      toast({ title: 'Installment updated', status: 'success' });
    },
    onError: (error) => toast({ title: errorMessage(error), status: 'error' }),
  });

  return (
    <Stack spacing={6}>
      <Box bg="white" p={5} borderRadius="lg" boxShadow="sm">
        <Heading size="sm" mb={4}>
          Advances
        </Heading>
        <QueryState isLoading={advances.isLoading} error={advances.error}>
          <TableContainer>
            <Table size="sm">
              <Thead bg="gray.50">
                <Tr>
                  <Th>Issued</Th>
                  <Th>Note</Th>
                  <Th isNumeric>Principal</Th>
                  <Th isNumeric>Recovered</Th>
                  <Th isNumeric>Outstanding</Th>
                  <Th>Status</Th>
                  <Th>Installment</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {(advances.data ?? []).map((advance) => (
                  <Tr key={advance.id}>
                    <Td>{advance.issuedOn}</Td>
                    <Td>{advance.note ?? '—'}</Td>
                    <Td isNumeric>{formatNprPaisa(advance.principalPaisa)}</Td>
                    <Td isNumeric>{formatNprPaisa(advance.recoveredPaisa)}</Td>
                    <Td isNumeric>{formatNprPaisa(advance.outstandingPaisa)}</Td>
                    <Td>
                      <Badge colorScheme={advance.status === 'ACTIVE' ? 'orange' : 'green'}>
                        {advance.status}
                      </Badge>
                    </Td>
                    <Td>
                      {admin && advance.status === 'ACTIVE' ? (
                        <HStack>
                          <Input
                            size="xs"
                            width="100px"
                            placeholder="cap"
                            value={
                              installmentEdits[advance.id] ??
                              (advance.installmentPaisa === null
                                ? ''
                                : paisaToNprInput(advance.installmentPaisa))
                            }
                            onChange={(event) =>
                              setInstallmentEdits({
                                ...installmentEdits,
                                [advance.id]: event.target.value,
                              })
                            }
                          />
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() =>
                              updateInstallment.mutate({
                                id: advance.id,
                                value: installmentEdits[advance.id] ?? '',
                              })
                            }
                          >
                            Save
                          </Button>
                        </HStack>
                      ) : advance.installmentPaisa === null ? (
                        'policy cap'
                      ) : (
                        formatNprPaisa(advance.installmentPaisa)
                      )}
                    </Td>
                    <Td>
                      <Button size="xs" variant="ghost" onClick={() => setSelected(advance.id)}>
                        Ledger
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </QueryState>

        {admin && (
          <>
            <Divider my={4} />
            <HStack align="flex-end" wrap="wrap" spacing={3}>
              <FormControl maxW="160px">
                <FormLabel fontSize="sm">Principal (NPR)</FormLabel>
                <Input
                  size="sm"
                  value={form.principal}
                  onChange={(event) => setForm({ ...form, principal: event.target.value })}
                />
              </FormControl>
              <FormControl maxW="170px">
                <FormLabel fontSize="sm">Issued on</FormLabel>
                <Input
                  size="sm"
                  type="date"
                  value={form.issuedOn}
                  onChange={(event) => setForm({ ...form, issuedOn: event.target.value })}
                />
              </FormControl>
              <FormControl maxW="170px">
                <FormLabel fontSize="sm">Installment (NPR, optional)</FormLabel>
                <Input
                  size="sm"
                  placeholder="policy cap"
                  value={form.installment}
                  onChange={(event) => setForm({ ...form, installment: event.target.value })}
                />
              </FormControl>
              <Button
                size="sm"
                colorScheme="brand"
                isDisabled={!form.principal}
                isLoading={create.isPending}
                onClick={() => create.mutate()}
              >
                Record advance
              </Button>
            </HStack>
          </>
        )}
      </Box>

      {selected && (
        <Box bg="white" p={5} borderRadius="lg" boxShadow="sm">
          <HStack justify="space-between" mb={3}>
            <Heading size="sm">Recovery ledger</Heading>
            <Button size="xs" variant="ghost" onClick={() => setSelected(null)}>
              Close
            </Button>
          </HStack>
          <QueryState isLoading={ledger.isLoading} error={ledger.error}>
            <TableContainer>
              <Table size="sm">
                <Thead bg="gray.50">
                  <Tr>
                    <Th>Period</Th>
                    <Th isNumeric>Recovered</Th>
                    <Th>Finalized at</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {(ledger.data?.entries ?? []).map((entry) => (
                    <Tr key={entry.recoveryId}>
                      <Td>{entry.periodLabel}</Td>
                      <Td isNumeric>{formatNprPaisa(entry.amountPaisa)}</Td>
                      <Td>{formatDateTime(entry.recoveredAt)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableContainer>
            {(ledger.data?.entries ?? []).length === 0 && (
              <Text mt={3} fontSize="sm" color="gray.500">
                Recoveries are recorded only when a run is finalized.
              </Text>
            )}
          </QueryState>
        </Box>
      )}
    </Stack>
  );
}

function SecretTab({
  employeeId,
  periods,
  secrets,
}: {
  employeeId: string;
  periods: Period[];
  secrets: ReturnType<typeof useQuery<SecretComponent[]>>;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ periodId: '', amount: '', note: '' });
  const selectedPeriod = periods.find((period) => period.id === form.periodId);
  const selectedFinalized = selectedPeriod?.runStatus === 'FINALIZED';

  const save = useMutation({
    mutationFn: () => {
      const amountPaisa = parseNprToPaisa(form.amount);
      if (amountPaisa === null) throw new Error('Secret amount must be a rupee amount.');
      return api.put<SecretComponent | null>(
        `/api/admin/employees/${employeeId}/secret-components`,
        { periodId: form.periodId, amountPaisa, note: form.note || null },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['secret-components', employeeId] });
      setForm({ periodId: '', amount: '', note: '' });
      toast({ title: 'Secret component saved', status: 'success' });
    },
    onError: (error) => toast({ title: errorMessage(error), status: 'error' }),
  });

  return (
    <Box bg="purple.50" p={5} borderRadius="lg" borderWidth="1px" borderColor="purple.200">
      <Heading size="sm" color="purple.800" mb={2}>
        Admin-only secret component
      </Heading>
      <Text fontSize="sm" color="purple.800" mb={4}>
        This amount is never part of the employee-facing payslip, API response, HTML, PDF, or logs.
        It appears only in the admin cost view and finalized admin snapshots. Zero removes it.
      </Text>
      <QueryState isLoading={secrets.isLoading} error={secrets.error}>
        <TableContainer bg="white" borderRadius="md">
          <Table size="sm">
            <Thead bg="purple.100">
              <Tr>
                <Th>Period</Th>
                <Th isNumeric>Amount</Th>
                <Th>Note</Th>
                <Th>Updated</Th>
              </Tr>
            </Thead>
            <Tbody>
              {(secrets.data ?? []).map((secret) => (
                <Tr key={secret.id}>
                  <Td>{secret.periodLabel}</Td>
                  <Td isNumeric>{formatNprPaisa(secret.amountPaisa)}</Td>
                  <Td>{secret.note ?? '—'}</Td>
                  <Td>{formatDateTime(secret.updatedAt)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
        {(secrets.data ?? []).length === 0 && (
          <Text fontSize="sm" color="purple.800" mt={3}>
            No secret component is recorded for this employee.
          </Text>
        )}
      </QueryState>

      <Divider my={4} borderColor="purple.200" />
      <HStack align="flex-end" wrap="wrap" spacing={3}>
        <FormControl maxW="200px">
          <FormLabel fontSize="sm" color="purple.900">
            Period
          </FormLabel>
          <Select
            size="sm"
            placeholder="Period"
            value={form.periodId}
            onChange={(event) => setForm({ ...form, periodId: event.target.value })}
          >
            {periods.map((period) => (
              <option
                key={period.id}
                value={period.id}
                disabled={period.runStatus === 'FINALIZED'}
              >
                {period.label}
                {period.runStatus === 'FINALIZED' ? ' (finalized)' : ''}
              </option>
            ))}
          </Select>
        </FormControl>
        <FormControl maxW="160px">
          <FormLabel fontSize="sm" color="purple.900">
            Amount (NPR)
          </FormLabel>
          <Input
            size="sm"
            bg="white"
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
          />
        </FormControl>
        <FormControl maxW="260px">
          <FormLabel fontSize="sm" color="purple.900">
            Note
          </FormLabel>
          <Input
            size="sm"
            bg="white"
            value={form.note}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
          />
        </FormControl>
        <Button
          size="sm"
          colorScheme="purple"
          isDisabled={!form.periodId || !form.amount || selectedFinalized}
          isLoading={save.isPending}
          onClick={() => save.mutate()}
        >
          Save secret
        </Button>
      </HStack>
      {selectedFinalized && (
        <Text fontSize="sm" color="purple.800" mt={3}>
          This period is finalized. Secret components can only be set before finalization.
        </Text>
      )}
    </Box>
  );
}
