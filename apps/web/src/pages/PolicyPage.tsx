import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  Select,
  SimpleGrid,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useToast,
} from '@chakra-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { QueryState } from '../components/PageState';
import { ApiError, api } from '../lib/api';
import { bpsToPercent, formatDateTime, formatNprPaisa, parseNprToPaisa } from '../lib/format';
import { useRole } from '../lib/role';
import type { Period, Policy, PolicyBundle } from '../lib/types';

export function PolicyPage() {
  const { role } = useRole();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [fiscalYearId, setFiscalYearId] = useState('fy-2083-84');

  const fiscalYears = useQuery({
    queryKey: ['fiscal-years'],
    queryFn: () => api.get<Array<{ id: string; label: string }>>('/api/fiscal-years'),
  });
  const bundle = useQuery({
    queryKey: ['policy-bundle', fiscalYearId],
    queryFn: () => api.get<PolicyBundle>(`/api/fiscal-years/${fiscalYearId}/policy`),
  });
  const periods = useQuery({ queryKey: ['periods'], queryFn: () => api.get<Period[]>('/api/periods') });

  const [form, setForm] = useState({
    effectiveFromSeq: '1',
    ssfEmployeeBps: '1100',
    ssfEmployerBps: '2000',
    retirementCapAnnualPaisa: '500000.00',
    retirementShareDen: '3',
    otMultiplierBps: '15000',
    otDivisorDays: '30',
    otHoursPerDay: '8',
    securityFundBps: '200',
    advanceMaxRecoveryBps: '5000',
    taxSlabSetId: '',
  });

  const create = useMutation({
    mutationFn: () => {
      const cap = parseNprToPaisa(form.retirementCapAnnualPaisa);
      if (cap === null) throw new Error('Retirement cap must be a rupee amount.');
      return api.post<Policy>(`/api/fiscal-years/${fiscalYearId}/policies`, {
        effectiveFromSeq: Number(form.effectiveFromSeq),
        ssfEmployeeBps: Number(form.ssfEmployeeBps),
        ssfEmployerBps: Number(form.ssfEmployerBps),
        retirementCapAnnualPaisa: cap,
        retirementShareDen: Number(form.retirementShareDen),
        otMultiplierBps: Number(form.otMultiplierBps),
        otDivisorDays: Number(form.otDivisorDays),
        otHoursPerDay: Number(form.otHoursPerDay),
        securityFundBps: Number(form.securityFundBps),
        advanceMaxRecoveryBps: Number(form.advanceMaxRecoveryBps),
        taxSlabSetId: form.taxSlabSetId || (bundle.data?.policy?.taxSlabSetId ?? ''),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['policy-bundle', fiscalYearId] });
      toast({ title: 'Policy version created', status: 'success' });
    },
    onError: (error) => {
      toast({
        title: error instanceof ApiError ? error.message : 'Could not create the policy version.',
        status: 'error',
      });
    },
  });

  return (
    <QueryState isLoading={bundle.isLoading} error={bundle.error}>
      {bundle.data && (
        <Box>
          <HStack justify="space-between" align="flex-end" mb={5} wrap="wrap">
            <Box>
              <Heading size="lg">Fiscal year policy</Heading>
              <Text color="gray.600">
                Every rate and slab comes from a versioned fiscal-year policy row. There are no
                hard-coded rates in the engine.
              </Text>
            </Box>
            <Select
              width="200px"
              bg="white"
              value={fiscalYearId}
              onChange={(event) => setFiscalYearId(event.target.value)}
            >
              {(fiscalYears.data ?? []).map((year) => (
                <option key={year.id} value={year.id}>
                  {year.label}
                </option>
              ))}
            </Select>
          </HStack>

          {bundle.data.policy && (
            <>
              <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3} mb={5}>
                <PolicyStat label="Active version" value={`v${bundle.data.policy.version}`} />
                <PolicyStat
                  label="SSF employee / employer"
                  value={`${bpsToPercent(bundle.data.policy.ssfEmployeeBps)} / ${bpsToPercent(bundle.data.policy.ssfEmployerBps)}`}
                />
                <PolicyStat
                  label="Security fund"
                  value={bpsToPercent(bundle.data.policy.securityFundBps)}
                />
                <PolicyStat
                  label="Advance recovery cap"
                  value={bpsToPercent(bundle.data.policy.advanceMaxRecoveryBps)}
                />
              </SimpleGrid>

              <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4} mb={5}>
                <Box bg="white" p={5} borderRadius="lg" boxShadow="sm">
                  <Heading size="sm" mb={4}>
                    Tax slabs · {bundle.data.policy.taxSlabSetId}
                  </Heading>
                  <TableContainer>
                    <Table size="sm">
                      <Thead bg="gray.50">
                        <Tr>
                          <Th>Ordinal</Th>
                          <Th isNumeric>Upper bound (annual taxable)</Th>
                          <Th isNumeric>Rate</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {bundle.data.policy.slabs.map((slab) => (
                          <Tr key={slab.id}>
                            <Td>{slab.ordinal}</Td>
                            <Td isNumeric>
                              {slab.upperBoundPaisa === null
                                ? 'No limit'
                                : formatNprPaisa(slab.upperBoundPaisa)}
                            </Td>
                            <Td isNumeric>{bpsToPercent(slab.rateBps)}</Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </TableContainer>
                </Box>

                <Box bg="white" p={5} borderRadius="lg" boxShadow="sm">
                  <Heading size="sm" mb={4}>
                    Other parameters
                  </Heading>
                  <TableContainer>
                    <Table size="sm">
                      <Tbody>
                        <ParamRow
                          label="Retirement cap (annual)"
                          value={formatNprPaisa(bundle.data.policy.retirementCapAnnualPaisa)}
                        />
                        <ParamRow
                          label="Retirement share denominator"
                          value={String(bundle.data.policy.retirementShareDen)}
                        />
                        <ParamRow
                          label="Overtime multiplier"
                          value={bpsToPercent(bundle.data.policy.otMultiplierBps)}
                        />
                        <ParamRow
                          label="Overtime divisor (days)"
                          value={String(bundle.data.policy.otDivisorDays)}
                        />
                        <ParamRow
                          label="Overtime hours per day"
                          value={String(bundle.data.policy.otHoursPerDay)}
                        />
                        <ParamRow
                          label="Effective from period seq"
                          value={String(bundle.data.policy.effectiveFromSeq)}
                        />
                        <ParamRow
                          label="Created"
                          value={formatDateTime(bundle.data.policy.createdAt)}
                        />
                      </Tbody>
                    </Table>
                  </TableContainer>
                </Box>
              </SimpleGrid>

              <Box bg="white" p={5} borderRadius="lg" boxShadow="sm" mb={5}>
                <Heading size="sm" mb={4}>
                  Policy history
                </Heading>
                <TableContainer>
                  <Table size="sm">
                    <Thead bg="gray.50">
                      <Tr>
                        <Th>Version</Th>
                        <Th>Effective from</Th>
                        <Th>Created</Th>
                        <Th></Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {bundle.data.policies.map((policy) => (
                        <Tr key={policy.id}>
                          <Td>
                            <Badge colorScheme="blue">v{policy.version}</Badge>
                          </Td>
                          <Td>Period seq {policy.effectiveFromSeq}</Td>
                          <Td>{formatDateTime(policy.createdAt)}</Td>
                          <Td>
                            {policy.id === bundle.data.policy?.id && (
                              <Badge colorScheme="green">latest</Badge>
                            )}
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </TableContainer>
              </Box>
            </>
          )}

          {role === 'admin' ? (
            <Box bg="white" p={5} borderRadius="lg" boxShadow="sm">
              <Heading size="sm" mb={2}>
                Create a new policy version
              </Heading>
              <Text fontSize="sm" color="gray.600" mb={4}>
                Policies are immutable. A new version becomes effective from the chosen period
                sequence onwards; earlier finalized runs keep their own snapshots.
              </Text>
              <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
                <NumberField
                  label="Effective from period seq"
                  value={form.effectiveFromSeq}
                  onChange={(value) => setForm({ ...form, effectiveFromSeq: value })}
                />
                <NumberField
                  label="SSF employee (bps)"
                  value={form.ssfEmployeeBps}
                  onChange={(value) => setForm({ ...form, ssfEmployeeBps: value })}
                />
                <NumberField
                  label="SSF employer (bps)"
                  value={form.ssfEmployerBps}
                  onChange={(value) => setForm({ ...form, ssfEmployerBps: value })}
                />
                <FormControl>
                  <FormLabel fontSize="sm">Retirement cap (NPR/year)</FormLabel>
                  <Input
                    size="sm"
                    value={form.retirementCapAnnualPaisa}
                    onChange={(event) =>
                      setForm({ ...form, retirementCapAnnualPaisa: event.target.value })
                    }
                  />
                </FormControl>
                <NumberField
                  label="Retirement share denominator"
                  value={form.retirementShareDen}
                  onChange={(value) => setForm({ ...form, retirementShareDen: value })}
                />
                <NumberField
                  label="OT multiplier (bps)"
                  value={form.otMultiplierBps}
                  onChange={(value) => setForm({ ...form, otMultiplierBps: value })}
                />
                <NumberField
                  label="OT divisor days"
                  value={form.otDivisorDays}
                  onChange={(value) => setForm({ ...form, otDivisorDays: value })}
                />
                <NumberField
                  label="OT hours per day"
                  value={form.otHoursPerDay}
                  onChange={(value) => setForm({ ...form, otHoursPerDay: value })}
                />
                <NumberField
                  label="Security fund (bps)"
                  value={form.securityFundBps}
                  onChange={(value) => setForm({ ...form, securityFundBps: value })}
                />
                <NumberField
                  label="Advance cap (bps)"
                  value={form.advanceMaxRecoveryBps}
                  onChange={(value) => setForm({ ...form, advanceMaxRecoveryBps: value })}
                />
                <FormControl>
                  <FormLabel fontSize="sm">Tax slab set</FormLabel>
                  <Select
                    size="sm"
                    value={form.taxSlabSetId}
                    onChange={(event) => setForm({ ...form, taxSlabSetId: event.target.value })}
                  >
                    <option value="">Use current set ({bundle.data.policy?.taxSlabSetId ?? '—'})</option>
                    {bundle.data.taxSlabSets.map((set) => (
                      <option key={set.id} value={set.id}>
                        {set.name}
                      </option>
                    ))}
                  </Select>
                </FormControl>
              </SimpleGrid>
              <Button
                mt={5}
                size="sm"
                colorScheme="brand"
                isLoading={create.isPending}
                onClick={() => create.mutate()}
              >
                Create policy version
              </Button>
              {(periods.data ?? []).length > 0 && (
                <Text mt={3} fontSize="xs" color="gray.500">
                  Period seq 1 = {periods.data?.[0]?.label}. Effective seq must be between 1 and{' '}
                  {periods.data?.[periods.data.length - 1]?.seq}.
                </Text>
              )}
            </Box>
          ) : (
            <Alert status="info" borderRadius="md">
              <AlertIcon />
              <Text fontSize="sm">Only an admin can create a new policy version.</Text>
            </Alert>
          )}
        </Box>
      )}
    </QueryState>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <FormControl>
      <FormLabel fontSize="sm">{label}</FormLabel>
      <Input size="sm" type="number" value={value} onChange={(event) => onChange(event.target.value)} />
    </FormControl>
  );
}

function PolicyStat({ label, value }: { label: string; value: string }) {
  return (
    <Box bg="white" p={4} borderRadius="lg" boxShadow="sm">
      <Text fontSize="xs" color="gray.500">
        {label}
      </Text>
      <Text fontWeight="bold" mt={1}>
        {value}
      </Text>
    </Box>
  );
}

function ParamRow({ label, value }: { label: string; value: string }) {
  return (
    <Tr>
      <Td color="gray.600">{label}</Td>
      <Td isNumeric>{value}</Td>
    </Tr>
  );
}
