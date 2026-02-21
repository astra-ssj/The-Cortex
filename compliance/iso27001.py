# compliance/iso27001.py — ISO/IEC 27001:2022 Annex A. 93 controls in 4 themes.

from __future__ import annotations

from compliance.models import Control, EvidenceType, Framework, Requirement

_E = EvidenceType
_R = Requirement


def _req(cid: str, desc: str) -> Requirement:
    return _R(id=cid, article_ref=cid.upper().replace(".", "."), description=desc, evidence_types=[_E(id=cid, name="Evidence", description="")])


def get_iso27001() -> Framework:
    """Build and return ISO/IEC 27001:2022 with 93 Annex A controls in 4 domains."""
    org = "Organizational Controls"
    people = "People Controls"
    physical = "Physical Controls"
    tech = "Technological Controls"

    controls = [
        # A.5 — Organizational (37)
        Control(id="a.5.1", name="Policies for Information Security", domain=org, requirements=[_req("a.5.1.1", "Policies for information security shall be defined and approved.")]),
        Control(id="a.5.2", name="Information Security Roles and Responsibilities", domain=org, requirements=[_req("a.5.2.1", "Information security roles and responsibilities shall be defined and allocated.")]),
        Control(id="a.5.3", name="Segregation of Duties", domain=org, requirements=[_req("a.5.3.1", "Conflicting duties and conflicting areas of responsibility shall be segregated.")]),
        Control(id="a.5.4", name="Management Responsibilities", domain=org, requirements=[_req("a.5.4.1", "Management shall require all personnel to apply information security in accordance with policies and topic-specific policies.")]),
        Control(id="a.5.5", name="Contact with Authorities", domain=org, requirements=[_req("a.5.5.1", "The organization shall establish and maintain contact with relevant authorities.")]),
        Control(id="a.5.6", name="Contact with Special Interest Groups", domain=org, requirements=[_req("a.5.6.1", "The organization shall establish and maintain contact with special interest groups or other specialist security forums.")]),
        Control(id="a.5.7", name="Threat Intelligence", domain=org, requirements=[_req("a.5.7.1", "Information relating to security threats shall be collected and analysed.")]),
        Control(id="a.5.8", name="Information Security in Project Management", domain=org, requirements=[_req("a.5.8.1", "Information security shall be integrated into project management.")]),
        Control(id="a.5.9", name="Inventory of Information and Other Assets", domain=org, requirements=[_req("a.5.9.1", "An inventory of information and other associated assets shall be identified and maintained.")]),
        Control(id="a.5.10", name="Acceptable Use of Information and Other Assets", domain=org, requirements=[_req("a.5.10.1", "Rules for the acceptable use and procedures for handling information and other assets shall be defined and implemented.")]),
        Control(id="a.5.11", name="Return of Assets", domain=org, requirements=[_req("a.5.11.1", "Personnel and other interested parties as appropriate shall return organization-owned assets as required.")]),
        Control(id="a.5.12", name="Classification of Information", domain=org, requirements=[_req("a.5.12.1", "Information shall be classified in terms of legal requirements and sensitivity.")]),
        Control(id="a.5.13", name="Information Labelling", domain=org, requirements=[_req("a.5.13.1", "An appropriate set of procedures for information labelling shall be defined and implemented.")]),
        Control(id="a.5.14", name="Information Transfer", domain=org, requirements=[_req("a.5.14.1", "Rules, procedures or agreements for the transfer of information shall be in place.")]),
        Control(id="a.5.15", name="Access Control", domain=org, requirements=[_req("a.5.15.1", "Rules to control physical and logical access to information and other assets shall be defined and implemented.")]),
        Control(id="a.5.16", name="Identity Management", domain=org, requirements=[_req("a.5.16.1", "The full life cycle of identities shall be managed.")]),
        Control(id="a.5.17", name="Authentication Information", domain=org, requirements=[_req("a.5.17.1", "Allocation and use of authentication information shall be managed.")]),
        Control(id="a.5.18", name="Access Rights", domain=org, requirements=[_req("a.5.18.1", "Access rights to information and other assets shall be provisioned, reviewed and removed.")]),
        Control(id="a.5.19", name="Information Security in Supplier Relationships", domain=org, requirements=[_req("a.5.19.1", "Processes and procedures for managing the information security risks associated with supplier relationships shall be defined and implemented.")]),
        Control(id="a.5.20", name="Addressing Security When Managing Supplier Agreements", domain=org, requirements=[_req("a.5.20.1", "Agreements with suppliers shall define requirements for the security of the organization's information.")]),
        Control(id="a.5.21", name="Managing Information Security in the ICT Supply Chain", domain=org, requirements=[_req("a.5.21.1", "Processes and procedures shall be defined and implemented to manage the information security risks associated with the use of ICT products and services supply chain.")]),
        Control(id="a.5.22", name="Monitoring, Review and Change Management of Supplier Services", domain=org, requirements=[_req("a.5.22.1", "The organization shall regularly monitor, review and manage changes to supplier services.")]),
        Control(id="a.5.23", name="Information Security for Use of Cloud Services", domain=org, requirements=[_req("a.5.23.1", "Processes for acquisition, use and exit of cloud services shall be defined and implemented.")]),
        Control(id="a.5.24", name="Information Security Incident Management Planning", domain=org, requirements=[_req("a.5.24.1", "Processes and procedures shall be defined and implemented for the planning and preparation for the detection and response to information security incidents.")]),
        Control(id="a.5.25", name="Assessment and Decision on Information Security Events", domain=org, requirements=[_req("a.5.25.1", "The organization shall assess and decide on how to manage information security events.")]),
        Control(id="a.5.26", name="Response to Information Security Incidents", domain=org, requirements=[_req("a.5.26.1", "Information security incidents shall be responded to in accordance with the documented procedures.")]),
        Control(id="a.5.27", name="Learning from Information Security Incidents", domain=org, requirements=[_req("a.5.27.1", "Knowledge gained from information security incidents shall be used to strengthen and improve controls.")]),
        Control(id="a.5.28", name="Collection of Evidence", domain=org, requirements=[_req("a.5.28.1", "Procedures for the identification, collection, acquisition and preservation of evidence shall be defined and implemented.")]),
        Control(id="a.5.29", name="Disruption During an Incident", domain=org, requirements=[_req("a.5.29.1", "Information security shall be maintained during disruption.")]),
        Control(id="a.5.30", name="ICT Readiness for Business Continuity", domain=org, requirements=[_req("a.5.30.1", "ICT readiness for business continuity shall be planned and implemented.")]),
        Control(id="a.5.31", name="Legal, Statutory, Regulatory and Contractual Requirements", domain=org, requirements=[_req("a.5.31.1", "Legal, statutory, regulatory and contractual requirements shall be identified and documented.")]),
        Control(id="a.5.32", name="Intellectual Property Rights", domain=org, requirements=[_req("a.5.32.1", "Rights and obligations for the use of intellectual property rights shall be defined and implemented.")]),
        Control(id="a.5.33", name="Protection of Records", domain=org, requirements=[_req("a.5.33.1", "Records shall be protected from loss, destruction, falsification and unauthorized access.")]),
        Control(id="a.5.34", name="Privacy and Protection of PII", domain=org, requirements=[_req("a.5.34.1", "The organization shall identify and meet the requirements regarding the preservation of privacy and protection of PII.")]),
        Control(id="a.5.35", name="Independent Review of Information Security", domain=org, requirements=[_req("a.5.35.1", "The organization's approach to managing information security and its implementation shall be reviewed independently.")]),
        Control(id="a.5.36", name="Documented Operating Procedures", domain=org, requirements=[_req("a.5.36.1", "Operating procedures for information processing facilities shall be documented and made available to personnel who need them.")]),
        Control(id="a.5.37", name="Segregation of Environments", domain=org, requirements=[_req("a.5.37.1", "Environments shall be segregated.")]),
        # A.6 — People (8)
        Control(id="a.6.1", name="Screening", domain=people, requirements=[_req("a.6.1.1", "Background verification checks on candidates for employment or appointment shall be carried out.")]),
        Control(id="a.6.2", name="Terms and Conditions of Employment", domain=people, requirements=[_req("a.6.2.1", "The employment contractual agreements shall state the personnel's and the organization's responsibilities for information security.")]),
        Control(id="a.6.3", name="Information Security Awareness, Education and Training", domain=people, requirements=[_req("a.6.3.1", "Personnel of the organization and relevant interested parties shall receive appropriate information security awareness, education and training.")]),
        Control(id="a.6.4", name="Disciplinary Process", domain=people, requirements=[_req("a.6.4.1", "A disciplinary process shall be in place for personnel or other interested parties who have committed an information security breach.")]),
        Control(id="a.6.5", name="Confidentiality or Non-Disclosure Agreements", domain=people, requirements=[_req("a.6.5.1", "Confidentiality or non-disclosure agreements shall be identified, documented and signed.")]),
        Control(id="a.6.6", name="Remote Working", domain=people, requirements=[_req("a.6.6.1", "Security measures shall be implemented when personnel are working remotely.")]),
        Control(id="a.6.7", name="Information Security Event Reporting", domain=people, requirements=[_req("a.6.7.1", "Information security events shall be reported through appropriate channels as quickly as possible.")]),
        Control(id="a.6.8", name="Change of Employment or Appointment", domain=people, requirements=[_req("a.6.8.1", "Responsibilities and duties that remain valid after a change or termination of employment or appointment shall be defined, enforced and communicated.")]),
        # A.7 — Physical (14)
        Control(id="a.7.1", name="Physical Security Perimeters", domain=physical, requirements=[_req("a.7.1.1", "Security perimeters shall be defined and used to protect areas that contain information and other assets.")]),
        Control(id="a.7.2", name="Physical Entry", domain=physical, requirements=[_req("a.7.2.1", "Secure areas shall be protected by appropriate entry controls and access points.")]),
        Control(id="a.7.3", name="Offices, Rooms and Facilities", domain=physical, requirements=[_req("a.7.3.1", "Security measures for offices, rooms and facilities shall be designed and implemented.")]),
        Control(id="a.7.4", name="Physical Security Monitoring", domain=physical, requirements=[_req("a.7.4.1", "Premises and facilities containing information processing facilities shall be continuously monitored.")]),
        Control(id="a.7.5", name="Physical and Environmental Protection", domain=physical, requirements=[_req("a.7.5.1", "Equipment shall be protected to reduce the risks from physical and environmental threats.")]),
        Control(id="a.7.6", name="Working in Secure Areas", domain=physical, requirements=[_req("a.7.6.1", "Security measures for working in secure areas shall be implemented and their effectiveness monitored.")]),
        Control(id="a.7.7", name="Clear Desk and Clear Screen", domain=physical, requirements=[_req("a.7.7.1", "Clear desk rules for papers and removable storage media and clear screen rules for information processing facilities shall be defined and applied.")]),
        Control(id="a.7.8", name="Equipment Siting and Protection", domain=physical, requirements=[_req("a.7.8.1", "Equipment shall be sited securely and protected.")]),
        Control(id="a.7.9", name="Security of Assets Off-Premises", domain=physical, requirements=[_req("a.7.9.1", "Off-site assets shall be protected.")]),
        Control(id="a.7.10", name="Storage Media", domain=physical, requirements=[_req("a.7.10.1", "Storage media shall be managed through their life cycle of acquisition, use, transport and disposal in accordance with the organization's classification scheme.")]),
        Control(id="a.7.11", name="Supporting Utilities", domain=physical, requirements=[_req("a.7.11.1", "Equipment shall be protected from power failures and other disruptions caused by failures in supporting utilities.")]),
        Control(id="a.7.12", name="Cabling Security", domain=physical, requirements=[_req("a.7.12.1", "Cables carrying power, data or supporting information services shall be protected from interception, interference or damage.")]),
        Control(id="a.7.13", name="Equipment Maintenance", domain=physical, requirements=[_req("a.7.13.1", "Equipment shall be maintained correctly to ensure availability, integrity and confidentiality of information.")]),
        Control(id="a.7.14", name="Equipment Reuse or Disposal", domain=physical, requirements=[_req("a.7.14.1", "Items of equipment containing storage media shall be verified to ensure that any sensitive data and licensed software have been removed or securely overwritten prior to disposal or reuse.")]),
        # A.8 — Technological (34)
        Control(id="a.8.1", name="User Endpoint Devices", domain=tech, requirements=[_req("a.8.1.1", "Information stored on, processed by or accessible via user endpoint devices shall be protected.")]),
        Control(id="a.8.2", name="Privileged Access Rights", domain=tech, requirements=[_req("a.8.2.1", "Privileged access rights shall be managed and restricted.")]),
        Control(id="a.8.3", name="Information Access Restriction", domain=tech, requirements=[_req("a.8.3.1", "Access to information and other assets shall be restricted in accordance with the access control policy.")]),
        Control(id="a.8.4", name="Access to Source Code", domain=tech, requirements=[_req("a.8.4.1", "Read and write access to source code, development tools and software libraries shall be appropriately managed.")]),
        Control(id="a.8.5", name="Secure Authentication", domain=tech, requirements=[_req("a.8.5.1", "Secure authentication technologies and procedures shall be implemented based on information access restrictions and the organizational access control policy.")]),
        Control(id="a.8.6", name="Capacity Management", domain=tech, requirements=[_req("a.8.6.1", "The use of resources shall be monitored and adjusted in line with current and expected capacity requirements.")]),
        Control(id="a.8.7", name="Protection Against Malware", domain=tech, requirements=[_req("a.8.7.1", "Protection against malware shall be implemented and supported by appropriate user awareness.")]),
        Control(id="a.8.8", name="Management of Technical Vulnerabilities", domain=tech, requirements=[_req("a.8.8.1", "Information about technical vulnerabilities of information systems in use shall be obtained, the organization's exposure to such vulnerabilities shall be evaluated and appropriate measures shall be taken.")]),
        Control(id="a.8.9", name="Configuration Management", domain=tech, requirements=[_req("a.8.9.1", "Configurations, including security configurations, of hardware, software, services and networks shall be established, documented, implemented, monitored and reviewed.")]),
        Control(id="a.8.10", name="Information Deletion", domain=tech, requirements=[_req("a.8.10.1", "Information stored in information systems, devices or in other storage media shall be deleted when no longer required.")]),
        Control(id="a.8.11", name="Data Masking", domain=tech, requirements=[_req("a.8.11.1", "Data masking shall be used in accordance with the organization's topic-specific policy on access control and other related topic-specific policies, and business requirements.")]),
        Control(id="a.8.12", name="Data Leakage Prevention", domain=tech, requirements=[_req("a.8.12.1", "Data leakage prevention measures shall be applied to systems, networks and any other devices that process, store or transmit the organization's information.")]),
        Control(id="a.8.13", name="Information Backup", domain=tech, requirements=[_req("a.8.13.1", "Backup copies of information, software and systems shall be maintained and tested regularly in accordance with the agreed topic-specific policy on backup.")]),
        Control(id="a.8.14", name="Information Processing Facilities", domain=tech, requirements=[_req("a.8.14.1", "Information processing facilities shall be resilient to ensure the availability of the information processed, stored and transmitted by the organization.")]),
        Control(id="a.8.15", name="Logging", domain=tech, requirements=[_req("a.8.15.1", "Logs that record activities, exceptions, faults and other relevant events shall be produced, stored and protected.")]),
        Control(id="a.8.16", name="Monitoring Activities", domain=tech, requirements=[_req("a.8.16.1", "Networks, systems and applications shall be monitored for anomalous behaviour and appropriate actions taken.")]),
        Control(id="a.8.17", name="Clock Synchronization", domain=tech, requirements=[_req("a.8.17.1", "The clocks of information processing systems used by the organization shall be synchronized to approved time sources.")]),
        Control(id="a.8.18", name="Use of Privileged Utility Programs", domain=tech, requirements=[_req("a.8.18.1", "The use of utility programs that can be capable of overriding system and application controls shall be restricted and tightly controlled.")]),
        Control(id="a.8.19", name="Installation of Software on Operational Systems", domain=tech, requirements=[_req("a.8.19.1", "Procedures and measures shall be implemented to manage the installation of software on operational systems.")]),
        Control(id="a.8.20", name="Networks Security", domain=tech, requirements=[_req("a.8.20.1", "Networks and network devices shall be secured, managed and controlled to protect information in systems and applications.")]),
        Control(id="a.8.21", name="Security of Network Services", domain=tech, requirements=[_req("a.8.21.1", "Security mechanisms, service levels and service requirements of network services shall be identified, implemented and monitored.")]),
        Control(id="a.8.22", name="Segregation of Networks", domain=tech, requirements=[_req("a.8.22.1", "Groups of information services, users and information systems shall be segregated in networks.")]),
        Control(id="a.8.23", name="Web Filtering", domain=tech, requirements=[_req("a.8.23.1", "Access to external websites shall be managed to reduce exposure to malicious content.")]),
        Control(id="a.8.24", name="Use of Cryptography", domain=tech, requirements=[_req("a.8.24.1", "Rules for the effective use of cryptography, including cryptographic key management, shall be defined and implemented.")]),
        Control(id="a.8.25", name="Secure Development Life Cycle", domain=tech, requirements=[_req("a.8.25.1", "Rules for the development of software and systems shall be established and implemented.")]),
        Control(id="a.8.26", name="Application Security Requirements", domain=tech, requirements=[_req("a.8.26.1", "Information security requirements shall be identified, specified and approved when developing or acquiring applications.")]),
        Control(id="a.8.27", name="System Security Engineering", domain=tech, requirements=[_req("a.8.27.1", "Principles for engineering secure systems shall be established, documented, maintained and applied to any system development activities.")]),
        Control(id="a.8.28", name="Secure Development Environment", domain=tech, requirements=[_req("a.8.28.1", "Secure development environments shall be established and appropriately protected.")]),
        Control(id="a.8.29", name="Outsourced Development", domain=tech, requirements=[_req("a.8.29.1", "The organization shall direct, monitor and review the activities related to outsourced system development.")]),
        Control(id="a.8.30", name="Separation of Development, Test and Production Environments", domain=tech, requirements=[_req("a.8.30.1", "Development, test and production environments shall be separated and secured.")]),
        Control(id="a.8.31", name="Change Management", domain=tech, requirements=[_req("a.8.31.1", "Changes to systems within the development life cycle shall be subject to change management procedures.")]),
        Control(id="a.8.32", name="Test Information", domain=tech, requirements=[_req("a.8.32.1", "Test information shall be appropriately selected, protected and managed.")]),
        Control(id="a.8.33", name="Information Systems Audit Considerations", domain=tech, requirements=[_req("a.8.33.1", "Audit tests and other assurance activities involving assessment of operational systems shall be planned and agreed to minimize the risk of disruption.")]),
        Control(id="a.8.34", name="Inventory of Information and Other Assets", domain=tech, requirements=[_req("a.8.34.1", "An inventory of information and other associated assets shall be identified and maintained.")]),
    ]
    return Framework(
        jurisdiction="international",
        purpose_tags=["isms", "iso27001", "security"],
        id="iso27001-2022",
        name="ISO/IEC 27001:2022",
        version="2022",
        controls=controls,
    )
