import {
  Badge,
  Box,
  Button,
  HStack,
  Heading,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { DraftBanner, QueryState } from '../components/PageState';
import { api } from '../lib/api';
import { formatDate, formatNprPaisa } from '../lib/format';
import type { Payslip } from '../lib/types';

export function PayslipPage() {
  const { payslipId = '' } = useParams();
  const payslip = useQuery({
    queryKey: ['payslip', payslipId],
    queryFn: () => api.get<Payslip>(`/api/payslips/${payslipId}`),
    enabled: payslipId.length > 0,
  });

  return (
    <QueryState isLoading={payslip.isLoading} error={payslip.error}>
      {payslip.data && <PayslipContent payslip={payslip.data} />}
    </QueryState>
  );
}

function PayslipContent({ payslip }: { payslip: Payslip }) {
  return (
    <Box>
      <HStack justify="space-between" align="flex-end" mb={5} wrap="wrap" spacing={3}>
        <Box>
          <Heading size="lg">Payslip · {payslip.period.label}</Heading>
          <Text color="gray.600">
            {payslip.employee.fullName} ({payslip.employee.code}) · {payslip.employee.department} ·{' '}
            {payslip.employee.designation}
          </Text>
        </Box>
        <HStack>
          <Badge colorScheme={payslip.run.status === 'FINALIZED' ? 'green' : 'orange'}>
            {payslip.run.status}
          </Badge>
          <Button
            as="a"
            href={`/api/payslips/${payslip.id}/html`}
            target="_blank"
            rel="noreferrer"
            size="sm"
            colorScheme="brand"
          >
            Print / save PDF
          </Button>
        </HStack>
      </HStack>

      {payslip.run.status === 'DRAFT' && <DraftBanner />}

      <SimpleGrid columns={{ base: 1, lg: 3 }} spacing={4} mb={5}>
        <Box bg="white" p={5} borderRadius="lg" boxShadow="sm">
          <Heading size="sm" mb={3}>
            Employee
          </Heading>
          <Detail label="Code" value={payslip.employee.code} />
          <Detail label="Employment" value={payslip.employee.employmentType} />
          <Detail label="SSF number" value={payslip.employee.ssfNumber ?? '—'} />
          <Detail label="Joined" value={payslip.employee.joiningDate} />
          <Detail label="Days employed" value={`${payslip.daysEmployed} / ${payslip.daysInPeriod}`} />
          <Detail label="Bank" value={payslip.employee.bankName} />
          <Detail label="Account" value={payslip.employee.bankAccountMasked} />
        </Box>

        <Box bg="white" p={5} borderRadius="lg" boxShadow="sm">
          <Heading size="sm" mb={3}>
            Period
          </Heading>
          <Detail label="Period" value={payslip.period.label} />
          <Detail label="Fiscal year" value={payslip.period.fiscalYearLabel} />
          <Detail label="From" value={formatDate(payslip.period.startDate)} />
          <Detail label="To" value={formatDate(payslip.period.endDate)} />
          <Detail label="Month index" value={String(payslip.period.indexInFy)} />
          <Detail label="Warnings" value={payslip.warnings.length ? payslip.warnings.map((w) => w.message).join('; ') : 'None'} />
        </Box>

        <Box bg="white" p={5} borderRadius="lg" boxShadow="sm">
          <Heading size="sm" mb={3}>
            Net pay
          </Heading>
          <Text fontSize="2xl" fontWeight="bold" color="brand.700">
            {formatNprPaisa(payslip.netPaisa)}
          </Text>
          <Text fontStyle="italic" color="gray.600" mt={2}>
            {payslip.netInWords}
          </Text>
          <DividerSpace />
          <SimpleGrid columns={2} spacing={2}>
            <MiniStat label="Gross" value={payslip.grossPaisa} />
            <MiniStat label="Deductions" value={payslip.totalDeductionsPaisa} />
          </SimpleGrid>
        </Box>
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4} mb={5}>
        <LineTable title="Earnings" lines={payslip.earnings} total={payslip.grossPaisa} />
        <LineTable title="Deductions" lines={payslip.deductions} total={payslip.totalDeductionsPaisa} />
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
        <Box bg="white" p={5} borderRadius="lg" boxShadow="sm">
          <Heading size="sm" mb={3}>
            Employer memo (not deducted)
          </Heading>
          {payslip.employerMemo.length === 0 ? (
            <Text color="gray.500" fontSize="sm">
              No employer-side lines for this employee.
            </Text>
          ) : (
            payslip.employerMemo.map((line, index) => (
              <HStack key={`${line.code}-${index}`} justify="space-between" py={1} fontSize="sm">
                <Text>{line.label}</Text>
                <Text>{formatNprPaisa(line.amountPaisa)}</Text>
              </HStack>
            ))
          )}
          <DividerSpace />
          <Text fontSize="sm" color="gray.600">
            Employer SSF is {formatNprPaisa(payslip.ssfEmployerPaisa)}. It increases company cost,
            not the employee's deductions.
          </Text>
        </Box>

        <Box bg="white" p={5} borderRadius="lg" boxShadow="sm">
          <Heading size="sm" mb={3}>
            Year to date (including this payslip)
          </Heading>
          <SimpleGrid columns={2} spacing={3}>
            <MiniStat label="Gross YTD" value={payslip.ytd.grossPaisa} />
            <MiniStat label="Taxable cash YTD" value={payslip.ytd.taxableCashPaisa} />
            <MiniStat label="Employee SSF YTD" value={payslip.ytd.ssfEmployeePaisa} />
            <MiniStat label="Employer SSF YTD" value={payslip.ytd.ssfEmployerPaisa} />
            <MiniStat label="TDS YTD" value={payslip.ytd.tdsPaisa} />
            <MiniStat label="Net YTD" value={payslip.ytd.netPaisa} />
          </SimpleGrid>
          <DividerSpace />
          <Text fontSize="sm" color="gray.600">
            Advance balance before {formatNprPaisa(payslip.advanceBalanceBeforePaisa)} · recovered{' '}
            {formatNprPaisa(payslip.advanceRecoveryPaisa)} · after{' '}
            {formatNprPaisa(payslip.advanceBalanceAfterPaisa)}
          </Text>
          <Text fontSize="sm" color="gray.600">
            Tax projection: {payslip.taxProjection.remainingPeriods} periods remain; projected annual
            tax {formatNprPaisa(payslip.taxProjection.annualTaxPaisa)}.
          </Text>
        </Box>
      </SimpleGrid>
    </Box>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <HStack justify="space-between" py={1} fontSize="sm" borderBottomWidth="1px" borderColor="gray.100">
      <Text color="gray.500">{label}</Text>
      <Text textAlign="right">{value}</Text>
    </HStack>
  );
}

function DividerSpace() {
  return <Box my={3} borderBottomWidth="1px" borderColor="gray.200" />;
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <Stat>
      <StatLabel fontSize="xs" color="gray.500">
        {label}
      </StatLabel>
      <StatNumber fontSize="sm">{formatNprPaisa(value)}</StatNumber>
    </Stat>
  );
}

function LineTable({
  title,
  lines,
  total,
}: {
  title: string;
  lines: Payslip['earnings'];
  total: number;
}) {
  return (
    <Box bg="white" p={5} borderRadius="lg" boxShadow="sm">
      <Heading size="sm" mb={3}>
        {title}
      </Heading>
      <TableContainer>
        <Table size="sm">
          <Thead bg="gray.50">
            <Tr>
              <Th>Line</Th>
              <Th>Basis</Th>
              <Th isNumeric>Amount</Th>
            </Tr>
          </Thead>
          <Tbody>
            {lines.map((line, index) => (
              <Tr key={`${line.code}-${index}`}>
                <Td>{line.label}</Td>
                <Td fontSize="xs" color="gray.500">
                  {line.taxable === undefined ? '—' : line.taxable ? 'taxable' : 'non-taxable'}
                </Td>
                <Td isNumeric>{formatNprPaisa(line.amountPaisa)}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>
      <HStack justify="space-between" mt={3} fontWeight="bold">
        <Text>Total</Text>
        <Text>{formatNprPaisa(total)}</Text>
      </HStack>
    </Box>
  );
}
