// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title HealthcareRecords
/// @notice Local-demo policy layer for patient-owned encrypted medical records.
/// @dev File plaintext and plaintext encryption keys must never be submitted to this contract.
contract HealthcareRecords {
    enum Role {
        None,
        Patient,
        Doctor,
        Hospital,
        Admin
    }

    struct Patient {
        string name;
        string publicKey;
        uint64 registeredAt;
        bool exists;
    }

    struct Doctor {
        string name;
        string specialization;
        string licenseId;
        string publicKey;
        uint64 registeredAt;
        bool approved;
        bool exists;
    }

    struct Hospital {
        string name;
        string registrationId;
        string publicKey;
        uint64 registeredAt;
        bool approved;
        bool exists;
    }

    struct MedicalRecord {
        uint256 id;
        address owner;
        string recordType;
        string encryptedFileCid;
        bytes32 ciphertextHash;
        uint64 createdAt;
        bool exists;
    }

    error AlreadyRegistered(address account);
    error InvalidProfile();
    error NotAdmin(address caller);
    error NotPendingProvider(address provider);
    error NotPatient(address caller);
    error InvalidRecordMetadata();
    error RecordNotFound(uint256 recordId);
    error AccessDenied(uint256 recordId, address caller);
    error NotRecordOwner(uint256 recordId, address caller);
    error ProviderNotApproved(address provider);
    error InvalidEnvelope();
    error PermissionAlreadyGranted(uint256 recordId, address provider);
    error PermissionNotGranted(uint256 recordId, address provider);
    error UnregisteredAccount(address account);

    event PatientRegistered(address indexed patient, string name);
    event DoctorRegistered(address indexed doctor, string name, string licenseId);
    event DoctorApproved(address indexed doctor, address indexed approvedBy);
    event HospitalRegistered(address indexed hospital, string name, string registrationId);
    event HospitalApproved(address indexed hospital, address indexed approvedBy);
    event MedicalRecordAdded(
        uint256 indexed recordId,
        address indexed owner,
        string recordType,
        string encryptedFileCid
    );
    event PermissionGranted(
        uint256 indexed recordId,
        address indexed owner,
        address indexed provider
    );
    event PermissionRevoked(
        uint256 indexed recordId,
        address indexed owner,
        address indexed provider
    );
    /// @notice Emitted only for access initiated through this DApp's signed workflow.
    event RecordAccessed(
        uint256 indexed recordId,
        address indexed owner,
        address indexed accessor
    );

    address public immutable admin;
    mapping(address => Role) private roles;
    mapping(address => Patient) private patients;
    mapping(address => Doctor) private doctors;
    mapping(address => Hospital) private hospitals;
    address[] private patientAddresses;
    address[] private doctorAddresses;
    address[] private hospitalAddresses;
    uint256 public totalRecords;
    mapping(uint256 => MedicalRecord) private records;
    mapping(address => uint256[]) private patientRecordIds;
    mapping(address => uint256[]) private providerRecordIds;
    mapping(uint256 => mapping(address => bool)) private permissions;
    mapping(uint256 => mapping(address => string)) private envelopeCids;
    mapping(uint256 => address[]) private permissionRecipients;
    mapping(uint256 => mapping(address => bool)) private providerIndexed;

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin(msg.sender);
        _;
    }

    modifier unregistered() {
        if (roles[msg.sender] != Role.None) revert AlreadyRegistered(msg.sender);
        _;
    }

    constructor() {
        admin = msg.sender;
        roles[msg.sender] = Role.Admin;
    }

    function registerPatient(
        string calldata name,
        string calldata publicKey
    ) external unregistered {
        _requireText(name);
        _requireText(publicKey);
        patients[msg.sender] = Patient(name, publicKey, uint64(block.timestamp), true);
        roles[msg.sender] = Role.Patient;
        patientAddresses.push(msg.sender);
        emit PatientRegistered(msg.sender, name);
    }

    function registerDoctor(
        string calldata name,
        string calldata specialization,
        string calldata licenseId,
        string calldata publicKey
    ) external unregistered {
        _requireText(name);
        _requireText(specialization);
        _requireText(licenseId);
        _requireText(publicKey);
        doctors[msg.sender] = Doctor(
            name,
            specialization,
            licenseId,
            publicKey,
            uint64(block.timestamp),
            false,
            true
        );
        roles[msg.sender] = Role.Doctor;
        doctorAddresses.push(msg.sender);
        emit DoctorRegistered(msg.sender, name, licenseId);
    }

    function registerHospital(
        string calldata name,
        string calldata registrationId,
        string calldata publicKey
    ) external unregistered {
        _requireText(name);
        _requireText(registrationId);
        _requireText(publicKey);
        hospitals[msg.sender] = Hospital(
            name,
            registrationId,
            publicKey,
            uint64(block.timestamp),
            false,
            true
        );
        roles[msg.sender] = Role.Hospital;
        hospitalAddresses.push(msg.sender);
        emit HospitalRegistered(msg.sender, name, registrationId);
    }

    function approveDoctor(address doctor) external onlyAdmin {
        if (!doctors[doctor].exists || doctors[doctor].approved) {
            revert NotPendingProvider(doctor);
        }
        doctors[doctor].approved = true;
        emit DoctorApproved(doctor, msg.sender);
    }

    function approveHospital(address hospital) external onlyAdmin {
        if (!hospitals[hospital].exists || hospitals[hospital].approved) {
            revert NotPendingProvider(hospital);
        }
        hospitals[hospital].approved = true;
        emit HospitalApproved(hospital, msg.sender);
    }

    function addMedicalRecord(
        string calldata recordType,
        string calldata encryptedFileCid,
        bytes32 ciphertextHash,
        string calldata ownerEnvelopeCid
    ) external returns (uint256 recordId) {
        if (roles[msg.sender] != Role.Patient) revert NotPatient(msg.sender);
        if (
            bytes(recordType).length == 0 ||
            bytes(encryptedFileCid).length == 0 ||
            ciphertextHash == bytes32(0) ||
            bytes(ownerEnvelopeCid).length == 0
        ) revert InvalidRecordMetadata();

        recordId = ++totalRecords;
        records[recordId] = MedicalRecord(
            recordId,
            msg.sender,
            recordType,
            encryptedFileCid,
            ciphertextHash,
            uint64(block.timestamp),
            true
        );
        patientRecordIds[msg.sender].push(recordId);
        envelopeCids[recordId][msg.sender] = ownerEnvelopeCid;
        emit MedicalRecordAdded(recordId, msg.sender, recordType, encryptedFileCid);
    }

    function grantPermission(
        uint256 recordId,
        address provider,
        string calldata envelopeCid
    ) external {
        MedicalRecord storage record = _requireRecord(recordId);
        if (record.owner != msg.sender) revert NotRecordOwner(recordId, msg.sender);
        if (bytes(envelopeCid).length == 0) revert InvalidEnvelope();
        if (!isApprovedProvider(provider)) revert ProviderNotApproved(provider);
        if (permissions[recordId][provider]) {
            revert PermissionAlreadyGranted(recordId, provider);
        }

        permissions[recordId][provider] = true;
        envelopeCids[recordId][provider] = envelopeCid;
        if (!providerIndexed[recordId][provider]) {
            providerIndexed[recordId][provider] = true;
            providerRecordIds[provider].push(recordId);
            permissionRecipients[recordId].push(provider);
        }
        emit PermissionGranted(recordId, msg.sender, provider);
    }

    function revokePermission(uint256 recordId, address provider) external {
        MedicalRecord storage record = _requireRecord(recordId);
        if (record.owner != msg.sender) revert NotRecordOwner(recordId, msg.sender);
        if (!permissions[recordId][provider]) {
            revert PermissionNotGranted(recordId, provider);
        }
        permissions[recordId][provider] = false;
        delete envelopeCids[recordId][provider];
        emit PermissionRevoked(recordId, msg.sender, provider);
    }

    function logRecordAccess(uint256 recordId) external {
        MedicalRecord storage record = _requireRecord(recordId);
        if (!hasAccess(recordId, msg.sender)) revert AccessDenied(recordId, msg.sender);
        emit RecordAccessed(recordId, record.owner, msg.sender);
    }

    function hasAccess(uint256 recordId, address account) public view returns (bool) {
        MedicalRecord storage record = records[recordId];
        if (!record.exists) return false;
        if (record.owner == account) return true;
        return permissions[recordId][account] && isApprovedProvider(account);
    }

    function getRecord(uint256 recordId) external view returns (MedicalRecord memory) {
        MedicalRecord storage record = _requireRecord(recordId);
        if (!hasAccess(recordId, msg.sender)) revert AccessDenied(recordId, msg.sender);
        return record;
    }

    function getPatientRecordIds() external view returns (uint256[] memory) {
        return patientRecordIds[msg.sender];
    }

    function getProviderRecordIds() external view returns (uint256[] memory) {
        return providerRecordIds[msg.sender];
    }

    function getEnvelopeCid(uint256 recordId) external view returns (string memory) {
        _requireRecord(recordId);
        if (!hasAccess(recordId, msg.sender)) revert AccessDenied(recordId, msg.sender);
        return envelopeCids[recordId][msg.sender];
    }

    function getPermissionRecipients(
        uint256 recordId
    ) external view returns (address[] memory) {
        MedicalRecord storage record = _requireRecord(recordId);
        if (record.owner != msg.sender) revert NotRecordOwner(recordId, msg.sender);
        address[] storage allRecipients = permissionRecipients[recordId];
        uint256 activeCount;
        for (uint256 i = 0; i < allRecipients.length; i++) {
            if (permissions[recordId][allRecipients[i]]) activeCount++;
        }
        address[] memory active = new address[](activeCount);
        uint256 cursor;
        for (uint256 i = 0; i < allRecipients.length; i++) {
            address provider = allRecipients[i];
            if (permissions[recordId][provider]) active[cursor++] = provider;
        }
        return active;
    }

    function getRole(address account) external view returns (Role) {
        return roles[account];
    }

    function getPatientProfile(address account) external view returns (Patient memory) {
        return patients[account];
    }

    function getDoctorProfile(address account) external view returns (Doctor memory) {
        return doctors[account];
    }

    function getHospitalProfile(address account) external view returns (Hospital memory) {
        return hospitals[account];
    }

    function getPatientAddresses() external view returns (address[] memory) {
        return patientAddresses;
    }

    function getDoctorAddresses() external view returns (address[] memory) {
        return doctorAddresses;
    }

    function getHospitalAddresses() external view returns (address[] memory) {
        return hospitalAddresses;
    }

    function getPublicEncryptionKey(address account) external view returns (string memory) {
        Role role = roles[account];
        if (role == Role.Patient) return patients[account].publicKey;
        if (role == Role.Doctor) return doctors[account].publicKey;
        if (role == Role.Hospital) return hospitals[account].publicKey;
        revert UnregisteredAccount(account);
    }

    function getPendingDoctorAddresses() external view returns (address[] memory) {
        uint256 count;
        for (uint256 i = 0; i < doctorAddresses.length; i++) {
            if (!doctors[doctorAddresses[i]].approved) count++;
        }
        address[] memory pending = new address[](count);
        uint256 cursor;
        for (uint256 i = 0; i < doctorAddresses.length; i++) {
            address account = doctorAddresses[i];
            if (!doctors[account].approved) pending[cursor++] = account;
        }
        return pending;
    }

    function getPendingHospitalAddresses() external view returns (address[] memory) {
        uint256 count;
        for (uint256 i = 0; i < hospitalAddresses.length; i++) {
            if (!hospitals[hospitalAddresses[i]].approved) count++;
        }
        address[] memory pending = new address[](count);
        uint256 cursor;
        for (uint256 i = 0; i < hospitalAddresses.length; i++) {
            address account = hospitalAddresses[i];
            if (!hospitals[account].approved) pending[cursor++] = account;
        }
        return pending;
    }

    function isApprovedProvider(address account) public view returns (bool) {
        Role role = roles[account];
        return
            (role == Role.Doctor && doctors[account].approved) ||
            (role == Role.Hospital && hospitals[account].approved);
    }

    function _requireText(string calldata value) private pure {
        if (bytes(value).length == 0) revert InvalidProfile();
    }

    function _requireRecord(
        uint256 recordId
    ) private view returns (MedicalRecord storage record) {
        record = records[recordId];
        if (!record.exists) revert RecordNotFound(recordId);
    }
}
