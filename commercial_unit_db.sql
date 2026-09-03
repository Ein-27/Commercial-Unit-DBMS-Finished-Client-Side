-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Jul 15, 2026 at 02:07 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `commercial_unit_db`
--

-- --------------------------------------------------------

--
-- Table structure for table `blocks`
--

CREATE TABLE `blocks` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `externalId` varchar(255) NOT NULL,
  `locationId` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(255) NOT NULL,
  `order` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `blocks`
--

INSERT INTO `blocks` (`id`, `externalId`, `locationId`, `name`, `order`) VALUES
(322, '0bcb3da3-4499-4a02-8967-25b085e404cb', 204, 'A', 1),
(323, '5c795ffe-c334-47d2-8eb3-42c680181110', 206, 'A', 1),
(324, 'fdd968f5-87fa-4dad-8496-58109d99d5ba', 205, 'A', 1),
(325, '06143fbe-52a3-4ccb-8b80-eca9db8a7942', 204, 'B', 2),
(326, 'e01535dc-e8d1-4b2e-87d7-fd0f4f0fd1cd', 205, 'B', 2),
(327, 'f5988d80-284d-4ecf-b2c1-8d166bb39c3a', 206, 'B', 2),
(328, '4ce4d77c-8cee-494b-80dc-b482cd7e16ba', 204, 'C', 3),
(329, '94115504-551d-48f3-b4d0-4a466181939b', 205, 'C', 3),
(330, 'b0ca669f-87da-49c2-92bf-829e09f88891', 206, 'C', 3);

-- --------------------------------------------------------

--
-- Table structure for table `lessees`
--

CREATE TABLE `lessees` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `externalId` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `soa` varchar(255) DEFAULT NULL,
  `unitId` bigint(20) UNSIGNED NOT NULL,
  `unitIds` text DEFAULT NULL,
  `blockId` bigint(20) UNSIGNED NOT NULL,
  `locationId` bigint(20) UNSIGNED NOT NULL,
  `monthlyRent` int(11) NOT NULL,
  `startDate` varchar(255) NOT NULL,
  `endDate` varchar(255) DEFAULT NULL,
  `isActive` tinyint(4) NOT NULL,
  `hasDepositAdvance` tinyint(4) NOT NULL,
  `depositAmount` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `lessees`
--

-- Stale sample lessee data removed to match the current database contents.

-- --------------------------------------------------------

--
-- Table structure for table `locations`
--

CREATE TABLE `locations` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `externalId` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `imageUrl` longtext NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `locations`
--

INSERT INTO `locations` (`id`, `externalId`, `name`, `imageUrl`) VALUES
(204, '3fb5ac3c-f622-470c-a6f7-ae69c423e7b0', 'MAXXDRM Commercial Leasing', ''),
(205, '9ca86c8d-66ce-40cb-8320-cd75ef02aa75', 'Camary Commercial Leasing', ''),
(206, 'cdc16b3e-e1c6-458b-889e-346c3a92dea5', 'Nielsen\'s Commercial Building', '');

-- --------------------------------------------------------

--
-- Table structure for table `app_settings`
--

CREATE TABLE `app_settings` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `settingKey` varchar(255) NOT NULL,
  `settingValue` longtext NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `payments`
--

CREATE TABLE `payments` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `externalId` varchar(255) NOT NULL,
  `lesseeId` bigint(20) UNSIGNED NOT NULL,
  `soa` varchar(255) DEFAULT NULL,
  `amount` int(11) NOT NULL,
  `totalDue` int(11) NOT NULL,
  `date` varchar(255) NOT NULL,
  `method` varchar(255) NOT NULL,
  `type` varchar(255) NOT NULL,
  `forMonth` varchar(255) NOT NULL,
  `isComplete` tinyint(4) NOT NULL,
  `notes` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `payments`
--

-- Stale sample payment data removed to match the current database contents.

-- --------------------------------------------------------

--
-- Table structure for table `units`
--

CREATE TABLE `units` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `externalId` varchar(255) NOT NULL,
  `blockId` bigint(20) UNSIGNED NOT NULL,
  `number` varchar(255) NOT NULL,
  `order` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `units`
--

INSERT INTO `units` (`id`, `externalId`, `blockId`, `number`, `order`) VALUES
(1390, '3ab12090-9057-473a-82de-5ecb88aed655', 325, '1', 1),
(1391, '52fd69d4-b87e-4ba4-a7da-87ab120fc652', 329, '1', 1),
(1392, '8dbf5bb9-a5d5-483a-ad27-f37c201d9500', 326, '1', 1),
(1393, 'af6c5fe8-2924-4af1-8ca9-2f7b15a9d97a', 322, '1', 1),
(1394, 'b8870767-aa69-4df6-a216-0655365e573d', 330, '1', 1),
(1395, 'ba6d0981-21ae-45ff-9b01-65597e28263d', 327, '1', 1),
(1396, 'ca513ea2-8498-4786-8217-03c5c0cbeaca', 324, '1', 1),
(1397, 'cf102c94-1810-4004-9dcc-8ee749a8df38', 328, '1', 1),
(1398, 'ddd10299-5d83-4985-9989-5e6b76bfc175', 323, '1', 1),
(1399, '30d1d8c1-67d4-404d-bbb2-023733acfdc4', 324, '2', 2),
(1400, '39f45022-27e0-483a-b63e-4ee0fee10670', 325, '2', 2),
(1401, '46abc9aa-9c91-4206-bf06-26b4530c6173', 326, '2', 2),
(1402, '7f1c96db-0f02-4eae-a31e-8112ab4020ce', 328, '2', 2),
(1403, '9cd1c957-af51-47aa-9a95-5f354d5ba796', 322, '2', 2),
(1404, '9e7daabc-a6b8-47f9-b2ff-0d91ee124c3d', 330, '2', 2),
(1405, 'a0240f63-0763-4dfa-a5e1-876d9fb2cb5f', 329, '2', 2),
(1406, 'ac0e25e7-ac7a-4fbb-be69-8beae2c662cb', 323, '2', 2),
(1407, 'ace6537f-17bb-4647-8390-8d7038b295ad', 327, '2', 2),
(1408, '2b92055e-dc60-433c-b8f1-1c1149be80b1', 326, '3', 3),
(1409, '49b8628f-a330-466e-a29e-d9ba6635348c', 323, '3', 3),
(1410, '4b0cf65e-2c2d-47c0-bb02-c5d74947b041', 324, '3', 3),
(1411, '65400a2e-b26b-4446-9e95-fdcdd216babb', 330, '3', 3),
(1412, '75561673-8ec6-4bb9-9f36-ea5c64056c34', 325, '3', 3),
(1413, '8580fa04-780d-4c33-a8fe-f5ace5d4d771', 329, '3', 3),
(1414, 'a50b1b0d-c377-42eb-97c9-a46cf114cea9', 327, '3', 3),
(1415, 'ae9dd82b-261b-41c4-916a-c3ddd09b7a88', 328, '3', 3),
(1416, 'e04aa25b-7bb7-4d5d-9406-ca2a7ac7e15e', 322, '3', 3),
(1417, '14272387-8822-44f3-8da0-b681f167d88c', 327, '4', 4),
(1418, '31b213bd-4e9a-43ac-9c02-e7f422f02311', 325, '4', 4),
(1419, '344f0c97-2c68-4091-aae6-5e87ccff0594', 324, '4', 4),
(1420, '44de1439-8ae4-460e-b008-6d74bc332858', 328, '4', 4),
(1421, '5b44ffb3-36a8-4d4f-8ea5-0eba71beb1b6', 323, '4', 4),
(1422, '5bb0077a-9b67-4f7e-955f-dd1a6e424844', 326, '4', 4),
(1423, 'd0c5232c-b5ff-42f3-b114-10c9ec221abe', 330, '4', 4),
(1424, 'd2754911-5923-42aa-809a-355f0555374b', 329, '4', 4),
(1425, 'f543807c-a5d7-41a1-88a3-7296796789db', 322, '4', 4),
(1426, '3548da34-4fe4-4c86-ad7a-624787a65c0a', 330, '5', 5),
(1427, '36d5c517-b894-4479-937c-5485251a117a', 327, '5', 5),
(1428, '398b1434-a95c-4593-a637-141fb92d5411', 323, '5', 5),
(1429, '462b126b-97fd-41c3-b6c8-8b494c8a926c', 324, '5', 5),
(1430, '6f388d53-5c81-43c8-900f-a70812a0c0cb', 329, '5', 5),
(1431, '7872ee2f-5f7b-4604-a0b3-d3592ba0440f', 328, '5', 5),
(1432, '7b7bfca7-5084-4cc7-b422-06116e1d0d24', 325, '5', 5),
(1433, 'acea135f-6104-4af4-a4ab-6303837ecfd7', 326, '5', 5),
(1434, 'bcfa52db-2aef-4ddb-a539-13c1a77f8314', 322, '5', 5),
(1435, '05867d46-31a3-4fb3-a62e-e77953622a9c', 322, '6', 6),
(1436, '973f96ba-c649-4a93-a117-188038a4a94a', 328, '6', 6),
(1437, 'a3939403-d2b8-48da-b75b-c06edf9a170e', 325, '6', 6);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `blocks`
--
ALTER TABLE `blocks`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `externalId` (`externalId`),
  ADD KEY `locationId` (`locationId`);

--
-- Indexes for table `lessees`
--
ALTER TABLE `lessees`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `externalId` (`externalId`),
  ADD KEY `unitId` (`unitId`),
  ADD KEY `blockId` (`blockId`),
  ADD KEY `locationId` (`locationId`);

--
-- Indexes for table `locations`
--
ALTER TABLE `locations`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `externalId` (`externalId`);

--
-- Indexes for table `payments`
--
ALTER TABLE `payments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `externalId` (`externalId`),
  ADD KEY `lesseeId` (`lesseeId`);

--
-- Indexes for table `units`
--
ALTER TABLE `units`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `externalId` (`externalId`),
  ADD KEY `blockId` (`blockId`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `blocks`
--
ALTER TABLE `blocks`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=331;

--
-- AUTO_INCREMENT for table `lessees`
--
ALTER TABLE `lessees`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `locations`
--
ALTER TABLE `locations`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=942;

--
-- AUTO_INCREMENT for table `payments`
--
ALTER TABLE `payments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `units`
--
ALTER TABLE `units`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1438;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `blocks`
--
ALTER TABLE `blocks`
  ADD CONSTRAINT `blocks_ibfk_1` FOREIGN KEY (`locationId`) REFERENCES `locations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `lessees`
--
ALTER TABLE `lessees`
  ADD CONSTRAINT `lessees_ibfk_1` FOREIGN KEY (`unitId`) REFERENCES `units` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `lessees_ibfk_2` FOREIGN KEY (`blockId`) REFERENCES `blocks` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `lessees_ibfk_3` FOREIGN KEY (`locationId`) REFERENCES `locations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `payments`
--
ALTER TABLE `payments`
  ADD CONSTRAINT `payments_ibfk_1` FOREIGN KEY (`lesseeId`) REFERENCES `lessees` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `units`
--
ALTER TABLE `units`
  ADD CONSTRAINT `units_ibfk_1` FOREIGN KEY (`blockId`) REFERENCES `blocks` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
